import assert from 'node:assert/strict';

// Run after browser.mjs creates its saved preseason and weekly teams.
export async function checkEdits(page) {
  const button = name => page.getByRole('button', {name, exact:true});
  const warning = page.getByRole('dialog', {name:'Unsaved changes'});
  const count = page.getByRole('spinbutton', {name:'Confessional/direct-to-camera appearance count', exact:true});

  await page.locator('#captain').selectOption('5');
  await page.locator('#episode').selectOption('3');
  await warning.waitFor();
  await button('Keep editing').click();
  assert.equal(await page.locator('#episode').inputValue(), '2');
  assert.equal(await page.locator('#captain').inputValue(), '5');
  await button('Update picks').click();

  await page.locator('#kind').selectOption('preseason');
  await page.locator('[data-pick="4"]').click();
  await page.locator('#kind').selectOption('final');
  await warning.waitFor();
  await button('Keep editing').click();
  assert.equal(await page.locator('#kind').inputValue(), 'preseason');
  assert.equal(await page.locator('[aria-pressed=true]').count(), 2);
  await page.locator('#kind').selectOption('final');
  await button('Discard changes').click();
  await page.locator('#side').selectOption('Traitors');
  await button('Organiser').click();
  await warning.waitFor();
  await button('Keep editing').click();
  assert.equal(await page.locator('#side').inputValue(), 'Traitors');
  await button('Save picks').click();
  await button('Organiser').click();

  await page.locator('#scored-character').selectOption('5');
  await count.fill('3');
  await page.locator('#scored-character').selectOption('6');
  await warning.waitFor();
  await button('Keep editing').click();
  assert.equal(await page.locator('#scored-character').inputValue(), '5');
  assert.equal(await count.inputValue(), '3');
  await page.locator('#admin-episode').selectOption('3');
  await warning.waitFor();
  await button('Keep editing').click();
  assert.equal(await page.locator('#admin-episode').inputValue(), '2');

  // Saving counts must retain other unsaved fields without submitting them.
  await page.locator('#winner').selectOption('Faithful');
  await button('Save event counts').click();
  assert.equal(await page.locator('#scored-character').inputValue(), '5');
  assert.equal(await count.inputValue(), '3');
  assert.equal(await page.locator('#winner').inputValue(), 'Faithful');
  await button('Standings').click();
  await warning.waitFor();
  assert.match(await warning.innerText(), /Season controls/);
  assert.doesNotMatch(await warning.innerText(), /Event counts/);
  await button('Keep editing').click();
  await button('Save season controls').click();

  // Two celebrities in two episodes must stay independent.
  await page.locator('#scored-character').selectOption('6');
  await count.fill('2');
  await button('Save event counts').click();
  assert.equal(await page.locator('#scored-character').inputValue(), '6');
  await page.locator('#admin-episode').selectOption('3');
  assert.equal(await count.inputValue(), '0');
  await count.fill('7');
  await button('Save event counts').click();
  await page.locator('#admin-episode').selectOption('2');
  assert.equal(await count.inputValue(), '2');
  await page.locator('#scored-character').selectOption('5');
  assert.equal(await count.inputValue(), '3');

  // A rejected add leaves both that form and unsaved scoring editable.
  await count.fill('4');
  await page.locator('#new-name').fill('Duplicate player');
  await page.locator('#new-email').fill('new@example.com');
  await button('Add player').click();
  await page.getByText('That email is already added.', {exact:true}).waitFor();
  assert.equal(await count.inputValue(), '4');
  assert.equal(await page.locator('#new-name').inputValue(), 'Duplicate player');
  assert.equal(await page.locator('#app').getAttribute('aria-busy'), null);
  await button('Standings').click();
  await warning.waitFor();
  assert.match(await warning.innerText(), /New player/);
  assert.match(await warning.innerText(), /Event counts/);
  await button('Discard changes').click();

  // A valid saved state survives reload without a discard prompt.
  await page.reload();
  await button('Organiser').click();
  await page.locator('#admin-episode').selectOption('2');
  await page.locator('#scored-character').selectOption('5');
  assert.equal(await count.inputValue(), '3');
  await page.locator('#admin-episode').selectOption('1');
  await button('My picks').click();
  await page.locator('#kind').selectOption('weekly');
  assert.equal(await page.locator('#episode').inputValue(), '1');
  assert.match(await page.locator('#view h3').innerText(), /^Episode 1/);
}
