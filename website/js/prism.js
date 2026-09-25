(() => {
  // The gallery switches real screenshots; it never simulates access to local apps.
  document.querySelectorAll('[data-product-gallery]').forEach((gallery) => {
    const buttons = [...gallery.querySelectorAll('[data-preview]')];
    const panels = [...gallery.querySelectorAll('[data-preview-panel]')];
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const selected = button.dataset.preview;
        buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        panels.forEach((panel) => { panel.hidden = panel.dataset.previewPanel !== selected; });
      });
    });
  });
})();
