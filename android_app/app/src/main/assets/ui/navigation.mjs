// Stable route IDs are used by existing data-page click handlers and journeys.
// New subpages should identify their parent tab here instead of changing the
// finance calculations or adding special cases to app.mjs.
export const NAV_ITEMS=Object.freeze([
  Object.freeze(['home','⌂','Özet']),
  Object.freeze(['wallet','▣','Cüzdan']),
  Object.freeze(['transactions','⇅','İşlem']),
  Object.freeze(['plan','◷','Plan']),
  Object.freeze(['import','↓','Ekstre']),
]);
const SUBPAGE_PARENT=Object.freeze({account:'wallet',incomePlans:'plan',statement:'import'});

export const activeBottomPage=page=>SUBPAGE_PARENT[page]||page;

export function renderBottomNavigation(page){
  const activePage=activeBottomPage(page);
  return NAV_ITEMS.map(([id,icon,label])=>`<button data-page="${id}" class="${activePage===id?'active':''}" ${activePage===id?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('');
}
