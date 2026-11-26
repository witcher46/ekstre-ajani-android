const kinds = {
  statement:'Kart ekstresi · Tahmini kalan',
  subscription:'Abonelik · Planlanan ödeme',
  income:'Beklenen gelir',
  goal:'Birikim hedefi · Hedef tutarı',
};

export function renderReminders({items, snoozes, today, status, syncFailed, esc, fmt, dateStatus}) {
  const settings = {
    unavailable:'<p>Android bildirimleri bu ortamda kullanılamıyor.</p>',
    off:'<p>Android bildirimleri kapalı.</p><button id="reminders-enable" data-action="enableReminders">Android bildirimlerini aç</button>',
    blocked:'<p>Android bildirim izni veya bildirim kanalı kapalı. Vadeleri burada takip edebilirsin.</p><button data-action="reminderSystemSettings">Android bildirim ayarlarını aç</button>',
    on:'<p>Android bildirimleri açık. Bildirimler genel bir uyarı gösterir. Teslim saati cihaz koşullarına bağlıdır.</p>',
  };
  return `<h1>Hatırlatmalar</h1>
    <section class="panel" aria-labelledby="reminder-dates">
      <h2 id="reminder-dates">Vade takvimi</h2>
      ${items.length ? `<ul class="list">${items.map(row => {
        const snoozed = snoozes[row.occurrence] > today;
        const label = snoozed ? row.name + ' ertelemesini kaldır' : row.name + ' hatırlatmasını ertele';
        return `<li class="row"><div><strong>${esc(row.name)}</strong>
          <small>${kinds[row.type]}</small><small>${dateStatus(row.date)}</small>
          <small>${row.amount === null ? 'Tutar bilinmiyor' : fmt(row.amount)}</small>
          ${snoozed ? `<small>${esc(snoozes[row.occurrence])} tarihine ertelendi</small>` : ''}
          </div><button type="button" data-reminder="${row.occurrence}" data-action="${snoozed ? 'undoReminderSnooze' : 'snoozeReminder'}"
            aria-label="${esc(label)}">${snoozed ? 'Ertelemeyi kaldır' : 'Ertele'}</button></li>`;
      }).join('')}</ul>` : '<p>Takip edilecek vade yok.</p>'}
    </section>
    <section class="panel" aria-labelledby="reminder-settings">
      <h2 id="reminder-settings">Cihaz bildirimleri</h2>
      ${settings[status] ?? settings.unavailable}
      ${status === 'on' || status === 'blocked' ? '<button id="reminders-disable" data-action="disableReminders">Android bildirimlerini kapat</button>' : ''}
      ${syncFailed ? '<p role="status">Android bildirim planı güncellenemedi.</p>' : ''}
    </section>`;
}
