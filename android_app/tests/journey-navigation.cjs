// Follow the same fixed tabs and Diğer choices as the app.
module.exports=async function openRoute(page,route){
  if(['plan','transactions','import','categories'].includes(route)){
    await page.locator('#more').click();
    await page.locator('#modal[open] [data-destination="'+route+'"]').click();
  }else{
    await page.locator('#nav [data-page="'+route+'"]').click();
  }
};
