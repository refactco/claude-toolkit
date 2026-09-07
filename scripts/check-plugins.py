#!/usr/bin/env python3
"""Check both package formats and shared skill files without executing tools."""
import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def check(root=ROOT):
    errors = []
    claude = json.loads((root / '.claude-plugin/marketplace.json').read_text())
    codex = json.loads((root / '.agents/plugins/marketplace.json').read_text())
    expected_names = [entry['name'] for entry in claude['plugins']]
    if [entry['name'] for entry in codex['plugins']] != expected_names:
        errors.append('Codex catalog must preserve the Claude pack list and order')
    if claude['name'] != codex['name']:
        errors.append('Marketplace names differ')
    if len(expected_names) != len(set(expected_names)):
        errors.append('Duplicate pack name')
    skills = 0
    for entry in claude['plugins']:
        name = entry['name']
        if not re.fullmatch(r'[a-z0-9-]+', name):
            errors.append(f'Invalid pack name: {name}')
            continue
        pack = root / 'plugins' / name
        source = json.loads((pack / '.claude-plugin/plugin.json').read_text())
        native = json.loads((pack / '.codex-plugin/plugin.json').read_text())
        if not (source['name'] == native['name'] == name):
            errors.append(f'{name}: inconsistent plugin names')
        if not (source['version'] == native['version'] == entry['version']):
            errors.append(f'{name}: inconsistent versions')
        if native.get('skills') != './skills/':
            errors.append(f'{name}: native manifest must load shared skills')
        if (pack / 'hooks/hooks.json').exists():
            errors.append(f'{name}: Claude hooks would be auto-loaded by Codex')
        if source.get('hooks'):
            path = pack / source['hooks']
            if not path.is_file():
                errors.append(f'{name}: missing Claude hooks')
            else:
                json.loads(path.read_text())
        runtime = pack / 'references/plugin-runtime.md'
        for skill in sorted((pack / 'skills').glob('*/SKILL.md')):
            skills += 1
            text = skill.read_text()
            match = re.match(r'^---\n(.*?)\n---', text, re.S)
            if not match:
                errors.append(f'{skill}: missing frontmatter')
                continue
            try:
                metadata = yaml.safe_load(match.group(1))
            except yaml.YAMLError as error:
                errors.append(f'{skill}: invalid YAML: {error}')
                continue
            if not isinstance(metadata, dict) or metadata.get('name') != skill.parent.name:
                errors.append(f'{skill}: invalid or mismatched skill name')
                continue
            if not isinstance(metadata.get('description'), str) or not metadata['description'].strip():
                errors.append(f'{skill}: missing skill description')
            if '../../references/plugin-runtime.md' not in text or not runtime.is_file():
                errors.append(f'{skill}: missing shared runtime instructions')
            for sibling in metadata.get('next_skills', []):
                if not (pack / 'skills' / sibling / 'SKILL.md').is_file():
                    errors.append(f'{skill}: missing next skill {sibling}')
    if errors:
        raise ValueError('\n'.join(errors))
    return len(expected_names), skills


if __name__ == '__main__':
    packs, skills = check()
    print(f'Validated {packs} Claude/Codex packs and {skills} shared skills.')
