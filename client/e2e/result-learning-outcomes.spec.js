import { test, expect } from '@playwright/test';

const GROWING_MISSIONS = [
  {
    id: 1,
    mission: 'WhereDoesItGrow',
    dutchGoal: 'Herken waar ons voedsel vandaan komt en begrijp hoe verschillende landbouwgewassen groeien.',
    englishGoal: 'Recognize fundamental food origins and understand how individual agricultural plant species develop biologically.',
  },
  {
    id: 2,
    mission: 'GardenPlanner',
    dutchGoal: 'Bekijk hoe de seizoenen de levenscyclus van gewassen beïnvloeden, verzorg een virtuele tuin door meerdere seizoenen heen en neem verantwoordelijkheid voor het kweken van planten.',
    englishGoal: 'Observe seasonal impacts on crop lifecycles, manage a multi season virtual plot, and assume responsibility for plant cultivation.',
  },
  {
    id: 3,
    mission: 'SoilDoctor',
    dutchGoal: 'Herken problemen met de gezondheid van bodem en planten en kies natuurlijke, ecologische oplossingen zoals compost, mulch of bodembedekkers.',
    englishGoal: 'Diagnose soil and plant health deficiencies while identifying natural, ecological remedies such as composting, mulch, or cover crops.',
  },
];

async function openDutchResult(page, mission) {
  await page.goto('/?testMode=1&lang=nl');
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  await page.evaluate((selected) => {
    window.__playfood.goToScreen('result', {
      island: 'growing',
      mission: selected.mission,
      missionId: selected.id,
      score: 100,
      passed: true,
    });
  }, mission);
  await expect(page.getByText('Leerdoelen')).toBeVisible();
  await page.getByText('Leerdoelen').click();
}

for (const mission of GROWING_MISSIONS) {
  test(`#23 shows the ${mission.mission} learning goal in Dutch`, async ({ page }) => {
    await openDutchResult(page, mission);

    await expect(page.getByText(mission.dutchGoal)).toBeVisible();
    await expect(page.getByText(mission.englishGoal)).toHaveCount(0);
  });
}

test('#23 shows the Island 1 KSAV outcomes in Dutch', async ({ page }) => {
  await openDutchResult(page, GROWING_MISSIONS[1]);

  for (const outcome of [
    'Begrijp hoe je je eigen voedsel kunt verbouwen.',
    'Kweek of verzorg voedsel op eenvoudige manieren.',
    'Ontwikkel geduld en zorg voor voedselproductie en de natuur.',
    'Waardeer voedsel als iets dat verbonden is met bodem, seizoen en inspanning.',
  ]) {
    await expect(page.getByText(outcome, { exact: false })).toBeVisible();
  }
});
