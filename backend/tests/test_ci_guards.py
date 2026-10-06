from pathlib import Path
import os
import subprocess
import sys


def test_hosted_backend_skips_fail_the_run(tmp_path: Path) -> None:
    source = Path(__file__).with_name('conftest.py')
    (tmp_path / 'conftest.py').write_text(source.read_text())
    (tmp_path / 'test_skipped.py').write_text("import pytest\ndef test_required():\n    pytest.skip('deliberately missing assertion')\n")
    result = subprocess.run(
        [sys.executable, '-m', 'pytest', str(tmp_path), '-q'],
        env={**os.environ, 'CI': 'true', 'PYTEST_ADDOPTS': ''},
        capture_output=True, text=True,
    )
    assert result.returncode == 1
    assert 'Hosted backend suite must run without skipped tests' in result.stdout
