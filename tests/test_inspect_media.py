"""Tests with self-generated fixtures; original game files are not required."""
import importlib.util
import os
from pathlib import Path
import struct
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'tools' / 'inspect_media.py'
spec = importlib.util.spec_from_file_location('inspect_media', SOURCE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7f
        n >>= 7
        out.append(b | 0x80 if n else b)
        if not n:
            return bytes(out)


def make_strings(pairs):
    result = bytearray(struct.pack('<I', 1))
    for key, text in pairs:
        data = text.encode('utf-8')
        result.extend(struct.pack('<I', key))
        result.extend(varint(len(data)))
        result.extend(data)
    return bytes(result)


class FormatTests(unittest.TestCase):
    def test_legacy_utf8(self):
        self.assertEqual(mod.parse_legacy_strings(make_strings([(7, 'Привет'), (8, 'Да')])),
                         {7: 'Привет', 8: 'Да'})

    def test_long_7bit_length(self):
        self.assertEqual(mod.parse_legacy_strings(make_strings([(5, 'Z' * 200)]))[5], 'Z' * 200)

    def test_duplicate_ids_rejected(self):
        with self.assertRaises(mod.FormatError):
            mod.parse_legacy_strings(make_strings([(9, 'One'), (9, 'Two')]))

    def test_truncated_record_rejected(self):
        with self.assertRaises(mod.FormatError):
            mod.parse_legacy_strings(make_strings([(3, 'Hello')])[:-1])

    def test_invalid_version(self):
        with self.assertRaises(mod.FormatError):
            mod.parse_legacy_strings(struct.pack('<I', 2))

    def test_invalid_flatbuffer_identifier(self):
        with self.assertRaises(mod.FormatError):
            mod.FlatBuffer(b'\x00' * 40, b'QLDB')

    def test_jpeg_record_counter(self):
        img = b'\xff\xd8\xff\xe0\x00\x01\xff\xd9'
        self.assertEqual(mod.count_rich_images(struct.pack('<I', len(img)) + img), 1)

    def test_jpeg_record_rejects_invalid(self):
        with self.assertRaises(mod.FormatError):
            mod.count_rich_images(struct.pack('<I', 9) + b'PNG!')

    @unittest.skipUnless(os.environ.get('QUIZZ_MEDIA_ZIP'), 'Private ZIP not provided')
    def test_real_assets_local_only(self):
        info = mod.inspect_zip(Path(os.environ['QUIZZ_MEDIA_ZIP']))
        self.assertEqual(info['flatbuffer_localization_strings'], 31824)
        self.assertEqual(info['legacy_localization_strings'], 11802)
        self.assertEqual(info['question_groups']['single'], 1188)
        self.assertEqual(info['rich_media_jpeg'], 89)


if __name__ == '__main__':
    unittest.main()
