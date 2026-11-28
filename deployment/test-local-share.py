"""Focused checks for the public source fixture shipped in local review packages."""
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('local_share', ROOT / 'deployment/build-local-share.py')
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)
NOTE = (ROOT / 'client/test-fixtures/market-trip/local-seasonal-food.md').read_text(encoding='utf-8')
QUOTES = (
    'Eating locally and seasonally offers many benefits, such as supporting local farmers, '
    'reducing the environmental impact of food transportation, and enjoying fresher, more nutrient-dense foods.',
    'At the same time, global food trade plays a vital role in ensuring food security, providing dietary diversity.',
)


class PublicSourceFixtureTests(unittest.TestCase):
    def test_contains_only_public_metadata_and_both_approved_quotes(self):
        fixture = BUILDER.public_market_source_fixture(NOTE)
        self.assertEqual(fixture, '# Local and Seasonal Food\n\n'
                         'Publisher: foodeducators.eu (EIT Food)\n'
                         'URL: https://www.foodeducators.eu/resources/resource/local-and-seasonal-food\n\n'
                         '## Public passages\n\n'
                         + ''.join(f'> {quote}\n\n' for quote in QUOTES))
        for quote in QUOTES:
            self.assertIn(quote, NOTE)

    def test_editorial_notes_are_not_packaged(self):
        fixture = BUILDER.public_market_source_fixture(
            NOTE + '\n## Internal review\nINTERNAL_REVIEW_MARKER: do not ship.\n')
        for marker in ('INTERNAL_REVIEW_MARKER', 'R7 cross-ref', 'marketTripData.js',
                       'seasonMatcherData.js', '[[eufic-seasonal]]', 'Market Trip ruling'):
            self.assertNotIn(marker, fixture)

    def test_missing_or_duplicate_public_passage_stops_packaging(self):
        public_line = next(line for line in NOTE.splitlines() if line.startswith('- Public balance statement'))
        lesson_line = next(line for line in NOTE.splitlines() if line.startswith('- Public lesson framing'))
        for label, changed in (
            ('missing', NOTE.replace(public_line, '')),
            ('duplicate', NOTE + '\n' + public_line),
            ('wrong pair', NOTE.replace(public_line, lesson_line)),
        ):
            with self.subTest(change=label):
                with self.assertRaisesRegex(RuntimeError, 'public source fixture'):
                    BUILDER.public_market_source_fixture(changed)

    def test_package_assembly_uses_public_fixture_without_changing_source_archive(self):
        with tempfile.TemporaryDirectory(prefix='playfood-local-share-test-') as temporary:
            candidate = Path(temporary) / 'candidate'
            for relative, source in BUILDER.select_sources(ROOT).items():
                # Template destinations are remapped by select_sources at assembly time.
                if relative in BUILDER.TEMPLATES:
                    relative = f'deployment/local-share/{relative}'
                destination = candidate / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(source.read_bytes())
            shutil.copy2(ROOT / 'server/phygital-codes.json', candidate / 'server/phygital-codes.json')

            def fake_client_build(root, package, node, secret, log):
                dist = package / 'client/dist'
                dist.mkdir(parents=True)
                (dist / 'index.html').write_text('<!doctype html><title>Packaging fixture</title>')
                log.write_text('Client compilation is outside this assembly-only test.\n')

            archive = Path(temporary) / 'assembly.zip'
            node = Path(os.environ.get('PLAYFOOD_TEST_NODE') or shutil.which('node'))
            with patch.object(BUILDER, 'build_client', side_effect=fake_client_build):
                BUILDER.build_package(candidate, archive, 'assembly-test', node)
            with zipfile.ZipFile(archive) as package:
                fixture = package.read(
                    'PLAYFOOD_Local_Game_and_Panel_assembly-test/client/test-fixtures/market-trip/local-seasonal-food.md'
                ).decode('utf-8')
            for quote in QUOTES:
                self.assertIn(quote, fixture)
            self.assertNotIn('R7 cross-ref', fixture)
            self.assertNotIn('marketTripData.js', fixture)
            self.assertEqual((candidate / 'client/test-fixtures/market-trip/local-seasonal-food.md').read_text(), NOTE)


if __name__ == '__main__':
    unittest.main()
