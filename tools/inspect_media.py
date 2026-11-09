#!/usr/bin/env python3
"""Inspect a personally supplied PS4 Unity Media.zip without deserializing code.

Only Python stdlib. No network use. Original assets are NEVER included in the repository.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import struct
import zipfile

BASE = 'Media/StreamingAssets/'
QL = BASE + 'QuestionData/locale/question_locale_russian.fb'
QP = BASE + 'QuestionData/question/question_russia.fb'
LEGACY = BASE + 'QuestionPack1/QuestionPack_russian.bin'
RICH = BASE + 'QuestionData/QuestionPack1/RichMedia.dat'
METADATA = 'Media/Metadata/global-metadata.dat'
MAX_ASSET_BYTES = 80_000_000
SENTINEL = 0xFFFFFFFF


class FormatError(ValueError):
    pass


def read_asset(archive, name):
    if name not in archive.namelist():
        raise FormatError(f'Missing required file: {name}')
    info = archive.getinfo(name)
    if info.file_size > MAX_ASSET_BYTES:
        raise FormatError(f'Asset is too large: {name}')
    data = archive.read(name)
    if len(data) != info.file_size:
        raise FormatError(f'Corrupt ZIP entry: {name}')
    return data


def u16(b, p):
    if p < 0 or p + 2 > len(b):
        raise FormatError('Out-of-range u16')
    return struct.unpack_from('<H', b, p)[0]


def u32(b, p):
    if p < 0 or p + 4 > len(b):
        raise FormatError('Out-of-range u32')
    return struct.unpack_from('<I', b, p)[0]


def i32(b, p):
    if p < 0 or p + 4 > len(b):
        raise FormatError('Out-of-range i32')
    return struct.unpack_from('<i', b, p)[0]


class FlatBuffer:
    def __init__(self, data, identifier):
        if len(data) < 24 or data[4:8] != identifier:
            raise FormatError(f'Expected FlatBuffers identifier: {identifier!r}')
        self.b = data
        self.root = u32(data, 0)
        self.fields(self.root)

    def fields(self, pos):
        vt = pos - i32(self.b, pos)
        n = u16(self.b, vt)
        if n < 4 or n > 256 or n % 2:
            raise FormatError('Invalid FlatBuffers vtable length')
        return [pos + off if (off := u16(self.b, vt + 4 + i * 2)) else None
                for i in range((n - 4) // 2)]

    def vector(self, loc, element_size=1):
        if loc is None:
            return None, 0
        pos = loc + u32(self.b, loc)
        count = u32(self.b, pos)
        if count > 1_000_000 or pos + 4 + count * element_size > len(self.b):
            raise FormatError('Out-of-range FlatBuffers vector')
        return pos + 4, count

    def table_vector(self, loc):
        pos, count = self.vector(loc, 4)
        return [elt + u32(self.b, elt) for elt in range(pos, pos + 4 * count, 4)]

    def uint_vector(self, loc):
        pos, count = self.vector(loc, 4)
        return list(struct.unpack_from('<' + str(count) + 'I', self.b, pos))

    def byte_vector(self, loc):
        pos, count = self.vector(loc, 1)
        return self.b[pos:pos + count]

    def string(self, loc):
        pos, count = self.vector(loc, 1)
        return self.b[pos:pos + count].decode('utf-8', errors='strict')


def parse_legacy_strings(data):
    if u32(data, 0) != 1:
        raise FormatError('Unexpected localization pack version')
    strings = {}
    p = 4
    while p < len(data):
        key = u32(data, p)
        p += 4
        length = 0
        for shift in range(0, 35, 7):
            if p >= len(data):
                raise FormatError('Truncated 7-bit length')
            part = data[p]
            p += 1
            length |= (part & 127) << shift
            if part < 128:
                break
        else:
            raise FormatError('Invalid 7-bit length')
        if length > len(data) - p or key in strings:
            raise FormatError('Invalid length or duplicate localization ID')
        strings[key] = data[p:p + length].decode('utf-8')
        p += length
    return strings


def parse_flatbuffer_strings(data):
    fb = FlatBuffer(data, b'QLDB')
    result = {}
    for pos in fb.table_vector(fb.fields(fb.root)[0]):
        f = fb.fields(pos)
        key = u32(data, f[0])
        if key in result:
            raise FormatError(f'Duplicate FlatBuffers localization ID {key}')
        result[key] = fb.string(f[1])
    return result


def parse_question_groups(data, locale):
    fb = FlatBuffer(data, b'QPDB')
    roots = fb.fields(fb.root)
    output = {'grab': [], 'single': [], 'matching': [], 'versus': []}
    types = {0: 'grab', 1: 'single', 2: 'matching', 4: 'versus'}

    def resolve(key):
        if key == SENTINEL:
            return None
        if key not in locale:
            raise FormatError(f'Missing localization key: {key}')
        return locale[key]

    for group, label in types.items():
        for at in fb.table_vector(roots[group]):
            f = fb.fields(at)
            ids = fb.uint_vector(f[1])
            flags = list(fb.byte_vector(f[0]))
            if label == 'single':
                if len(ids) != 4 or len(flags) != 4 or sum(flags) != 1:
                    raise FormatError('Invalid 4-choice question')
                output[label].append({'id': u32(data, f[5]), 'category_code': data[f[6]],
                    'question': resolve(u32(data, f[4])),
                    'answers': [resolve(x) for x in ids], 'correct': flags.index(1),
                    'explanation': resolve(u32(data, f[3]))})
            elif label == 'grab':
                if len(ids) != 16 or len(flags) != 16 or sum(flags) != 8:
                    raise FormatError('Invalid grab-bag question')
                output[label].append({'id': u32(data, f[4]), 'category_code': data[f[5]],
                    'question': resolve(u32(data, f[3])),
                    'answers': [resolve(x) for x in ids], 'correct_flags': flags})
            elif label == 'matching':
                left = fb.uint_vector(f[0])
                if len(left) != len(ids):
                    raise FormatError('Mismatched pair columns')
                output[label].append({'id': u32(data, f[4]), 'category_code': data[f[5]],
                    'question': resolve(u32(data, f[3])),
                    'left': [resolve(x) for x in left], 'right': [resolve(x) for x in ids]})
            elif label == 'versus':
                if len(ids) != len(flags):
                    raise FormatError('Invalid versus prompt')
                output[label].append({'id': u32(data, f[5]), 'category_code': data[f[6]],
                    'subjects': [resolve(u32(data, f[2])), resolve(u32(data, f[3]))],
                    'statements': [resolve(x) for x in ids], 'subject_flags': flags})
    return output


def count_rich_images(data):
    p = 0
    number = 0
    while p < len(data):
        size = u32(data, p)
        p += 4
        if size < 4 or size > len(data) - p or data[p:p + 2] != b'\xff\xd8':
            raise FormatError(f'Unexpected rich-media entry at offset {p}')
        p += size
        number += 1
    return number


def inspect_zip(zip_path, export_private=None):
    with zipfile.ZipFile(zip_path) as archive:
        legacy = parse_legacy_strings(read_asset(archive, LEGACY))
        strings = parse_flatbuffer_strings(read_asset(archive, QL))
        questions = parse_question_groups(read_asset(archive, QP), strings)
        rich_images = count_rich_images(read_asset(archive, RICH))
        meta = read_asset(archive, METADATA)
        if u32(meta, 0) != 0xFAB11BAF:
            raise FormatError('Unexpected IL2CPP metadata magic')
        metadata_version = u32(meta, 4)
        info = {'engine': 'Unity IL2CPP', 'il2cpp_metadata_version': metadata_version,
                'legacy_localization_strings': len(legacy),
                'flatbuffer_localization_strings': len(strings),
                'question_groups': {k: len(v) for k,v in questions.items()},
                'rich_media_jpeg': rich_images}
        if export_private is not None:
            out = Path(export_private)
            out.mkdir(parents=True, exist_ok=True)
            # No game resources are sent over the network or committed to Git.
            (out / 'ru-question-bank.private.json').write_text(
                json.dumps(questions, ensure_ascii=False, indent=2), encoding='utf-8')
            (out / 'ru-legacy-strings.private.json').write_text(
                json.dumps(legacy, ensure_ascii=False, indent=2), encoding='utf-8')
        return info


def main():
    parser = argparse.ArgumentParser(description='Offline inspector for user-provided Media.zip')
    parser.add_argument('media_zip', type=Path)
    parser.add_argument('--export-private', metavar='DIR', type=Path,
                        help='Export question strings to a LOCAL folder (do not commit or redistribute)')
    args = parser.parse_args()
    print(json.dumps(inspect_zip(args.media_zip, args.export_private), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
