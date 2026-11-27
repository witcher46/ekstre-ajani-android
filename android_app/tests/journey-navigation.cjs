// Follow the same fixed tabs and Diğer choices as the app.
async function openRoute(page,route){
  if(['plan','transactions','import','categories'].includes(route)){
    await page.locator('#more').click();
    await page.locator('#modal[open] [data-destination="'+route+'"]').click();
  }else{
    await page.locator('#nav [data-page="'+route+'"]').click();
  }
}

async function selectSummaryMonth(page,month){
  await openRoute(page,'reports');
  await page.getByLabel('Seçili ay',{exact:true}).fill(month);
  await openRoute(page,'home');
}

async function openSummaryAction(page,action){
  await page.locator('main [data-action=quickAdd]').click();
  await page.locator('#quick-add-options [data-action="'+action+'"]').click();
}

module.exports=openRoute;
module.exports.selectSummaryMonth=selectSummaryMonth;
module.exports.openSummaryAction=openSummaryAction;
