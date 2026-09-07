import assert from 'node:assert/strict';

// Uses the disposable demo after the other browser checks; episode 1 is still open.
export async function checkEpisodeOne(page) {
 const button=name=>page.getByRole('button',{name,exact:true});
 await button('Standings').click();
 await button('Pick episode 1 team').click();
 assert.equal(await page.locator('#episode').inputValue(),'1');
 assert.equal(await page.locator('[data-pick]').count(),21);
 for(const id of ['4','5','6','7','8','9','10','11']) await page.locator(`[data-pick="${id}"]`).click();
 await page.locator('#captain').selectOption('4');
 await button('Save picks').click();
 await button('Organiser').click();
 assert.equal(await page.locator('#team-size').inputValue(),'8');
 assert.equal(await page.locator('[data-role]').count(),0,'Episode 1 setup needs no roles');
 await page.locator('#scored-character').selectOption('4');
 assert.equal(await page.getByRole('spinbutton',{name:'Banished as a Traitor count',exact:true}).count(),0);
 await page.getByRole('spinbutton',{name:'Confessional/direct-to-camera appearance count',exact:true}).fill('3');
 await page.getByRole('spinbutton',{name:'Receives banishment votes count',exact:true}).fill('2');
 await page.getByRole('spinbutton',{name:'Receives or wins a shield count',exact:true}).fill('1');
 await button('Save event counts').click();
 await page.locator('#scored-character').selectOption('5');
 await page.getByRole('spinbutton',{name:'Participates in successful group mission count',exact:true}).fill('1');
 await button('Save event counts').click();
 await page.locator('#eplock').check();
 page.once('dialog',dialog=>dialog.accept());
 await button('Save episode setup').click();
 assert.equal(await page.locator('#team-size').isDisabled(),true);
 await button('Standings').click();
 const row=page.getByRole('row').filter({hasText:'Mark'});
 assert.equal(await row.getByRole('cell').nth(3).innerText(),'20');
 await button('My picks').click();
 assert.equal(await page.locator('[aria-pressed=true]').count(),8);
 assert.equal(await button('Update picks').isDisabled(),true);
 await button('Organiser').click();
 await page.locator('#admin-episode').selectOption('2');
 await page.getByText('Active cast and roles before this episode',{exact:true}).click();
 await button('Copy starting roles').click();
 assert.equal(await page.locator('[data-role="4"]').inputValue(),'Traitor');
 assert.equal(await page.locator('[data-role="6"]').inputValue(),'Faithful');
 await button('Save episode setup').click();
 await button('Standings').click();
}
