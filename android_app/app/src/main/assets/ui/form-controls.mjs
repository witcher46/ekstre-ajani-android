// Shared, DOM-free form markup used by the WebView application.
// The `extra` argument is internal, trusted markup (for static attributes),
// not a user-provided string.
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export const options=(items,selected)=>items.map(([value,label])=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');

export const field=(name,label,value='',type='text',extra='')=>`<label for="f-${name}">${escapeHtml(label)}</label><input id="f-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}>`;

export const select=(name,label,opts)=>`<label for="f-${name}">${escapeHtml(label)}</label><select id="f-${name}" name="${name}">${opts}</select>`;
