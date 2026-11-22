# Майнинг React/TypeScript-монорепозитория для SelfReview

Это **наблюдения по исходникам, а не автоматические договорённости**. Майнер обходит исходники JS/TS/JSX/TSX, не запускает их, использует только AST и импорты текущего файла, ищет повторяющиеся паттерны в разных файлах. Зависимости bily не устанавливаются, AI API не нужен, правила не утверждаются автоматически.

Собираются: импортируемые пакеты, React hooks, варианты зависимостей useEffect, JSX-компоненты и пропсы из статических импортов, способы объявления компонентов, экспорты и формы вызовов импортированных функций. Папка первого уровня внутри --code — лишь аналитическая группа, а не доказательство общей архитектуры.

## Windows PowerShell: первый запуск

Нужны Node.js 22.13+ и установленный SelfReview. В примере bily находится в C:\Repos\bily. Данные SelfReview лежат **снаружи** bily, чтобы не загрязнять рабочий Git.

~~~powershell
Set-Location 'C:\Repos\selfreview'
npm.cmd ci --ignore-scripts

# Только если конфигурации/каталога для bily ЕЩЁ НЕТ:
New-Item -ItemType Directory -Force 'C:\Repos\review-data\bily' | Out-Null
node .\bin\selfreview.mjs init --config 'C:\Repos\review-data\bily\selfreview.config.json' --scope bily-web --project 'C:\Repos\bily'
node .\bin\selfreview.mjs doctor --config 'C:\Repos\review-data\bily\selfreview.config.json'

# Только чтение: изучить весь выбранный react-apps в пределах лимита:
node .\bin\selfreview.mjs mine --config 'C:\Repos\review-data\bily\selfreview.config.json' --project bily --code 'C:\Repos\bily\react-apps' --min-files 3 --max-files 20000 --max-patterns 80 --out 'C:\Repos\review-data\bily\react-apps.mine.json'
$mining = Get-Content 'C:\Repos\review-data\bily\react-apps.mine.json' -Raw | ConvertFrom-Json
$mining.status
$mining.coverage
$mining.patterns | Select-Object -First 25 kind,value,distinctFiles,occurrences
~~~

**Если уже есть каталог SelfReview**, не выполняй init повторно: используй существующий --config и project ID из doctor. Папка --code должна находиться внутри зарегистрированного проекта. Можно повторить --code для непересекающихся каталогов.

Лимит по умолчанию — 20 000 исходников, максимум 2 МиБ на файл. Превышение лимита, битый UTF-8, ошибка разбора/чтения или не исключённая символическая ссылка дают **INCOMPLETE / exit 2**. Это не «успешно собранный скелет». Если файлов больше — увеличь --max-files (до 100 000), а генерацию и вендорные деревья исключай настройками include/exclude проекта обоснованно. Вывод ограничен 200 паттернами; patternsOmittedByLimit показывает, сколько не вошло.

## Обогатить существующие правила

Сначала просмотри примеры и убедись, что паттерн действительно оправдан (в разных приложениях он может быть противоположным). Затем повтори сканирование с --enrich:

~~~powershell
node .\bin\selfreview.mjs mine --config 'C:\Repos\review-data\bily\selfreview.config.json' --project bily --code 'C:\Repos\bily\react-apps' --min-files 3 --max-files 20000 --max-patterns 80 --enrich --out 'C:\Repos\review-data\bily\react-apps.enriched.json'
node .\bin\selfreview.mjs rules list --config 'C:\Repos\review-data\bily\selfreview.config.json' --scope bily-web
~~~

Команда добавляет только **candidate/manual/advisory** и evidence с SHA-256. Ранее утверждённые и отклонённые правила сохраняются; повторный запуск объединяет наблюдения, не создавая повторных решений. Для интересного кандидата: rules show RULE_ID, rules preview RULE_ID --project bily, далее осознанное решение rules approve RULE_ID --by REVIEWER --reason TEXT. Подтверждать паттерн лишь потому, что он частый, не стоит. Утверждённый manual не превращается автоматически в исполняемый AST-check.

## Передать знания Skill / агенту

При подготовке ревью изменений передай агенту исходные наблюдения **отдельно от утверждённых правил**:

~~~powershell
node .\bin\selfreview.mjs agent-pack --config 'C:\Repos\review-data\bily\selfreview.config.json' --project bily --base origin/main --knowledge 'C:\Repos\review-data\bily\react-apps.mine.json' --out 'C:\Repos\review-data\bily\agent-pack.json'
node .\bin\selfreview.mjs export --config 'C:\Repos\review-data\bily\selfreview.config.json' --scope bily-web --project bily --out 'C:\Repos\review-data\bily\skill-export-v1'
~~~

Укажи реальный baseline Git. Полученную папку Skill selfreview-bily-web можно установить в каталог Skills твоего Codex или OpenCode. Для каждого изменения агент должен сверять применимость наблюдений, искать контрпримеры и запускать проектные проверки. В agent-pack поле minedKnowledge — **неподтверждённый снимок**; импорту нельзя доверять как проверке свежести. После изменений в bily повтори mine.

**Ограничения:** нет межфайлового type checking, полного разрешения алиасов, dataflow, анализа side effects и маршрутов. Много повторений не доказывает качество. Публично не публикуй отчёты по приватному bily: в них есть внутренние имена модулей и пути. Следующий этап — независимая разметка новых изменений и отдельные типизированные проверки с отрицательными контролями для наиболее полезных паттернов.
