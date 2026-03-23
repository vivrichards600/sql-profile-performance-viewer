#!/usr/bin/env python3
import re

with open('src/viewer-app.js', 'r') as f:
    content = f.read()

# Fix addExpandButtonsToPanel signature
content = re.sub(
    r'function addExpandButtonsToPanel\(containerSelector, document, windowObject\)',
    'function addExpandButtonsToPanel(containerSelector, document, windowObject, elements, state)',
    content
)

# Fix openPanelModal signature
content = re.sub(
    r'function openPanelModal\(sourcePanel, document, windowObject\)',
    'function openPanelModal(sourcePanel, document, windowObject, elements, state)',
    content
)

# Fix the expand button click handler to use the correct parameters
content = re.sub(
    r'expandBtn\.addEventListener\(\'click\', event => \{\s+event\.stopPropagation\(\);\s+openPanelModal\(panel, document, windowObject\);\s+event\.stopPropagation\(\);\s+openPanelModal\(panel, document, windowObject\);',
    "expandBtn.addEventListener('click', event => {\n        event.stopPropagation();\n        openPanelModal(panel, document, windowObject, elements, state);",
    content
)

with open('src/viewer-app.js', 'w') as f:
    f.write(content)

print("Fixed viewer-app.js!")
