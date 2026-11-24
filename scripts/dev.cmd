@echo off
rem Starts the dev server from the app folder (used by the Claude preview pane).
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next dev -p 3100
