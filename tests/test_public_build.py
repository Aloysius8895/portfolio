import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_vercel', ROOT / 'tools/build_vercel.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicBuildTests(unittest.TestCase):
    def test_output_preserves_sources_escapes_text_and_excludes_draft_routes(self):
        parent = ROOT / '.build-tests'
        parent.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='admin-build-', dir=parent) as folder:
            folder = Path(folder).resolve()
            self.assertTrue(folder.is_relative_to(parent.resolve()))
            data = json.loads((ROOT / 'template3/projects/projects.json').read_text(encoding='utf-8'))
            original = (ROOT / 'template3/site/index.html').read_bytes()
            data['projects'][0]['name'] = r'Backslash \1 </script><script>alert(1)</script>'
            data['projects'][0]['repo_owner'] = 'different-owner'
            unpublished = data['projects'][-1]['slug']
            data['projects'][-1]['status'] = 'draft'
            path = folder / 'projects.json'
            path.write_text(json.dumps(data), encoding='utf-8')
            output = module.build(folder / 'output', path)
            page = (output / 'index.html').read_text(encoding='utf-8')
            self.assertEqual(page.count('data-film-item=""'), 8)
            self.assertNotIn('</script><script>alert(1)</script>', page)
            self.assertIn('\\u003c/script\\u003e', page)
            self.assertFalse((output / 'production' / unpublished).exists())
            detail = (output / 'production' / data['projects'][0]['slug'] / 'index.html').read_text(encoding='utf-8')
            self.assertIn('https://github.com/different-owner/', detail)
            self.assertTrue((output / 'hero/assets/final-atlas/manifest.json').is_file())
            self.assertTrue((output / 'admin/index.html').is_file())
            self.assertFalse((output / 'hero/tools').exists())
            self.assertFalse((output / 'projects/projects.json').exists())
            self.assertFalse((output / '.env').exists())
            self.assertEqual((ROOT / 'template3/site/index.html').read_bytes(), original)

    def test_output_cannot_overwrite_editable_source(self):
        for path in [ROOT, ROOT / 'template3', ROOT / 'admin', ROOT.parent]:
            with self.assertRaises(ValueError):
                module.build(path)


if __name__ == '__main__':
    unittest.main()
