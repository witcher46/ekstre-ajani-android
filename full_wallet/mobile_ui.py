"""Phone layout for the desktop wallet components."""

CSS = """<style>
.st-key-mobile_nav { display: none; }
@media (max-width: 760px) {
  [data-testid="stMainBlockContainer"] {
    padding: 3.35rem .85rem max(1.5rem, env(safe-area-inset-bottom));
  }
  [data-testid="stMainBlockContainer"] [data-testid="stHorizontalBlock"] {
    flex-wrap: wrap;
  }
  [data-testid="stMainBlockContainer"] [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
    flex: 1 1 min(100%, 17rem);
    min-width: min(100%, 17rem);
  }
  [data-testid="stMetric"] { padding: .85rem; min-height: 0; }
  [data-testid="stMetricLabel"] { white-space: normal; }
  [data-testid="stMetricValue"] { font-size: 1.55rem; }
  [data-testid="stTabs"] [data-baseweb="tab-list"] { gap: .65rem; overflow-x: auto; }
  [data-testid="stMainBlockContainer"] button,
  [data-testid="stMainBlockContainer"] [data-testid="stPageLink"] a { min-height: 44px; }
  .st-key-mobile_nav {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .25rem;
    background: var(--w-panel);
    border: 1px solid var(--w-line);
    border-radius: .85rem;
    padding: .3rem;
  }
  .st-key-mobile_nav [data-testid="stPageLink"] a {
    font-size: .79rem;
    padding: .3rem .28rem;
    border-radius: .45rem;
  }
  .w-calendar td { overflow-wrap: anywhere; }
}
</style>"""
