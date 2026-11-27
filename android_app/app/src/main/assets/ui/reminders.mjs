import {renderBackLink} from './navigation.mjs';

const kinds = {
  statement:'Kart ekstresi · Tahmini kalan',
  subscription:'Abonelik · Planlanan ödeme',
  income:'Beklenen gelir',
  goal:'Birikim hedefi · Hedef tutarı',
};

export function renderReminders({items, snoozes, today, status, syncFailed, esc, fmt, dateStatus, backTitle}) {
  const settings = {
    unavailable:'<p>Android bildirimleri bu ortamda kullanılamıyor.</p>',
    off:'<p>Android bildirimleri kapalı.</p><button id="reminders-enable" data-action="enableReminders">Android bildirimlerini aç</button>',
    blocked:'<p>Android bildirim izni veya bildirim kanalı kapalı. Vadeleri burada takip edebilirsin.</p><button data-action="reminderSystemSettings">Android bildirim ayarlarını aç</button>',
    on:'<p>Android bildirimleri açık. Cihazın yerel saatiyle 09.00 hedeflenir. Bildirim genel bir uyarı içerir ve daha geç gelebilir.</p>',
  };
  return `<div class="plan-surface">
    ${renderBackLink(backTitle)}
    <div class="plan-intro">
      <h1>Hatırlatmalar</h1>
      <p class="lead">Vadeleri buradan takip et. Ödeme durumunu bankandan kontrol et. Erteleme yalnızca bildirim gününü değiştirir.</p>
    </div>
    <section class="panel plan-note" aria-labelledby="reminder-settings">
      <h2 id="reminder-settings">Cihaz bildirimleri</h2>
      <div>${settings[status] ?? settings.unavailable}</div>
      ${status === 'on' || status === 'blocked' ? '<div class="plan-actions"><button type="button" id="reminders-disable" data-action="disableReminders">Android bildirimlerini kapat</button></div>' : ''}
      ${syncFailed ? '<p class="warning" role="status">Android bildirim planı güncellenemedi. Vadeleri buradan takip edebilirsin.</p>' : ''}
    </section>
    <section class="panel" aria-labelledby="reminder-dates">
      <h2 id="reminder-dates">Vade takvimi</h2>
      ${items.length ? `<ul class="plan-list">${items.map(row => {
        const snoozed = snoozes[row.occurrence] > today;
        const label = snoozed ? row.name + ' ertelemesini kaldır' : row.name + ' hatırlatmasını ertele';
        return `<li class="plan-record"><h3>${esc(row.name)}</h3>
          <p class="plan-status">${dateStatus(row.date)}</p>
          <dl class="plan-values"><div><dt>${kinds[row.type]}</dt><dd>${row.amount === null ? 'Tutar bilinmiyor' : fmt(row.amount)}</dd></div></dl>
          ${snoozed ? `<p class="plan-meta">Bildirim ${esc(snoozes[row.occurrence])} tarihine ertelendi.</p>` : ''}
          <div class="plan-actions"><button type="button" data-reminder="${row.occurrence}" data-action="${snoozed ? 'undoReminderSnooze' : 'snoozeReminder'}"
            ${snoozed ? '' : 'aria-haspopup="dialog" aria-controls="modal"'}
            aria-label="${esc(label)}">${snoozed ? 'Ertelemeyi kaldır' : 'Ertele'}</button></div></li>`;
      }).join('')}</ul>` : '<p class="empty-note">Takip edilecek vade yok. Gelir planı, abonelik, birikim hedefi veya vadeli ekstre eklediğinde burada görünür.</p>'}
    </section>
  </div>`;
}
