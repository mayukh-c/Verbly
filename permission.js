// Verbly v1 | one-time microphone permission page.
// An extension page (not the Google Form) must ask for the mic so Chrome remembers the choice for Verbly.
const s = document.getElementById('s');
async function ask() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    s.textContent = 'Microphone allowed. Close this tab, go back to your form and press Start again.';
  } catch (e) {
    s.textContent = 'Microphone blocked (' + e.name + '). Click the lock icon in the address bar, allow Microphone, then press the button again.';
  }
}
document.getElementById('b').onclick = ask;
ask();
