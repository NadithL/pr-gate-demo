"""Report exporter (benchmark: dependency category). Uses PyYAML and Jinja2 directly."""

import yaml
from jinja2 import Template


def export(report: dict) -> str:
    template = Template("{{ title }}\n{% for row in rows %}- {{ row }}\n{% endfor %}")
    return template.render(title=report["title"], rows=report["rows"])


def load_report(text: str) -> dict:
    return yaml.safe_load(text)
