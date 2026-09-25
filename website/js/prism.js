(() => {
  document.querySelectorAll('[data-film-play]').forEach((button) => {
    const video = document.getElementById(button.getAttribute('aria-controls'));
    if (!video) return;
    button.addEventListener('click', async () => {
      try {
        if (video.paused) await video.play();
        else video.pause();
      } catch {
        button.textContent = 'Try playing again';
      }
    });
    video.addEventListener('play', () => { button.textContent = 'Pause film'; });
    video.addEventListener('pause', () => { button.textContent = video.ended ? 'Replay film' : 'Resume film'; });
    video.addEventListener('ended', () => { button.textContent = 'Replay film'; });
  });
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
