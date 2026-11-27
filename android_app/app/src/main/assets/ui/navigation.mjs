import {escapeHtml as esc} from './form-controls.mjs';

export const NAV_ITEMS=Object.freeze([
  Object.freeze(['home','Özet']),
  Object.freeze(['wallet','Cüzdan']),
  Object.freeze(['reports','Raporlar']),
]);
const MORE_ITEMS=[
  ['plan','Plan','Bütçeler, gelir planları ve vadeler'],
  ['transactions','İşlemler','Ara, filtrele ve düzenle'],
  ['import','Ekstre','Ekstre yükle ve geçmişi gör'],
  ['categories','Kategoriler','Gelir, gider ve satıcı kuralları'],
];
const SUBPAGE_PARENT=Object.freeze({reportCategory:'reports',account:'wallet',balanceReview:'wallet',balanceApprovalHistory:'wallet',balanceApprovalDetail:'wallet'});
const ICON_PATHS={
  home:'M3 11 12 4l9 7v9h-6v-6H9v6H3z',
  wallet:'M3 7h18v11H3z M3 10h18 M15 15h3',
  reports:'M5 19h14 M7 16v-4m5 4V8m5 8V5',
  more:'M5 12h1m5 0h1m5 0h1',
  plan:'M4 6h16v14H4z M8 4v4m8-4v4M4 11h16m-12 4h4',
  transactions:'M3 8h16l-4-4m4 4-4 4m6 4H5l4-4m-4 4 4 4',
  import:'M6 3h8l4 4v14H6z M14 3v5h4m-9 4h6m-6 4h6',
  categories:'M5 9h14l1 11H4z M8 9V7a4 4 0 0 1 8 0v2',
  plus:'M5 12h14m-7-7v14',
  bank:'M3 9l9-5 9 5H3zm2 11h14M7 11v6m5-6v6m5-6v6',
  cash:'M3 7h18v11H3z M14 12.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0',
  edit:'m4 16-1 5 5-1L20 8l-4-4zm10-10 4 4',
  next:'m10 6 6 6-6 6',
};
export function uiIcon(name){
  return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+ICON_PATHS[name]+'"/></svg>';
}

export const activeBottomPage=page=>SUBPAGE_PARENT[page]||page;

export function renderBackLink(title,action='back'){
  return '<button type="button" class="back-link" data-action="'+esc(action)+'"><span aria-hidden="true">←</span> '+esc(title)+'</button>';
}

export function renderBottomNavigation(page){
  const activePage=activeBottomPage(page);
  const control=(id,label)=>'<span class="nav-icon">'+uiIcon(id)+'</span><span class="nav-label">'+label+'</span>';
  return NAV_ITEMS.map(([id,label])=>'<button type="button" data-page="'+id+'"'+(activePage===id?' aria-current="page"':'')+'>'+control(id,label)+'</button>').join('')+
    '<button type="button" id="more" data-action="openMore" aria-haspopup="dialog" aria-controls="modal">'+control('more','Diğer')+'</button>';
}

export function renderMoreNavigation(){
  return '<div id="more-options">'+MORE_ITEMS.map(([id,label,description])=>
    '<button type="button" class="menu-row" data-action="selectMorePage" data-destination="'+id+'">'+
    '<span class="row-icon">'+uiIcon(id)+'</span><span><strong>'+label+'</strong><small>'+description+'</small></span>'+uiIcon('next')+'</button>'
  ).join('')+'</div>';
}
