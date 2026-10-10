const pending = new Map();

export function loadLibrary(name, url) {
  if (window[name]) return Promise.resolve(window[name]);
  if (pending.has(name)) return pending.get(name);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (window[name]) resolve(window[name]);
      else { pending.delete(name); script.remove(); reject(new Error(`Falha ao carregar ${name}`)); }
    };
    script.onerror = () => { pending.delete(name); script.remove(); reject(new Error(`Falha ao carregar ${name}. Verifique sua conexão e tente novamente.`)); };
    document.head.appendChild(script);
  });
  pending.set(name, promise);
  return promise;
}

export const loadCharts = () => loadLibrary("Chart", "/vendor/chart.umd.js");
export const loadImageExporter = () => loadLibrary("html2canvas", "/vendor/html2canvas.min.js");
export const loadSheets = () => loadLibrary("XLSX", "/vendor/xlsx.full.min.js");
