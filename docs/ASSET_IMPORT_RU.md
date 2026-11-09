# Trivial Pursuit Live! 2 — локальное исследование данных

Этот инструмент **не содержит материалов Ubisoft**, не обращается к сети и не запускает код PS4. Используется только с файлами, которые пользователь законно получил и на которые у него есть права доступа. **Не коммитьте** экспортированные данные в публичный репозиторий без разрешения правообладателя.

## Что подтверждено по Media.zip

- Unity / IL2CPP, metadata v27.
- Media/StreamingAssets/QuestionPack1/QuestionPack_russian.bin: 11 802 записи в бинарном формате uint32(1); repeat { uint32 key; 7-bit length; UTF-8 text }.
- QuestionData/locale/question_locale_russian.fb: FlatBuffers, identifier QLDB, 31 824 текстовые записи с ключами.
- QuestionData/question/question_russia.fb: FlatBuffers, identifier QPDB, 4 заполненные группы данных: grab 758, single 1 188, matching 804, versus 490. Это **записи заданий**, а не 3240 отдельных вопросов с четырьмя вариантами.
- У single — 4 ответа и 1 помеченный верный; у grab — 16 ответов и 8 помеченных верных. Флаги исходной базы стоят до перемешивания вариантов.
- QuestionData/QuestionPack1/RichMedia.dat: 89 JPEG, идущих подряд в формате uint32 size; bytes[size].
- QuestionData/QuestionPack1/QuestionPack.dat: содержит заголовки сериализации .NET; **не десериализуйте** бинарным BinaryFormatter из недоверенного источника.
- Localization/FrontEndData/russian.bin: предоставленный файл пустой (0 байт).

Формат парной/двухколоночной викторины распознан структурно, но механика начисления очков и правила раундов пока **не сверены**. Категории обозначены числовыми кодами; их названия нельзя уверенно сопоставить без дополнительной проверки. Полный графический контент, персонажи и аудиофайлы ещё не получены.

## Использование

```bash
python tools/inspect_media.py /путь/к/Media.zip
python -m unittest discover -s tests -p 'test_inspect_media.py' -v
```

Экспорт **только в локальную папку**, которая находится в .gitignore:

```bash
python tools/inspect_media.py /путь/к/Media.zip --export-private local_exports
```

Создаются local_exports/ru-question-bank.private.json и local_exports/ru-legacy-strings.private.json. В опубликованный проект они не включаются. Запуск без --export-private только печатает статистику и не сохраняет тексты вопросов.

Для проверки на собственном архиве:

```bash
QUIZZ_MEDIA_ZIP=/путь/к/Media.zip python -m unittest discover -s tests -p 'test_inspect_media.py' -v
```

## Следующие материалы

Для анализа меню и 3D-ресурсов: Media/globalgamemanagers, Media/resources.assets, Media/sharedassets*.assets, Media/StreamingAssets/AssetBundles/PlatformBundle.unity3d. Для звуков: Media/StreamingAssets/Localization/russian_audio.bin. Передавать файлы sce_sys/ и ключи/лицензии не нужно.
