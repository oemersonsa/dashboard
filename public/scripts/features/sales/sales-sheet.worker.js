/* Leitura, identificação de cabeçalhos e consolidação fora da interface. */
let matrices = {};
self.onmessage = async ({ data }) => {
  try {
    const { findTable } = await import("./sales-sheet.calc.js");
    if (data.type === "read") {
      self.postMessage({ progress: "Lendo o arquivo em segundo plano…" });
      if (!self.XLSX) importScripts("/vendor/xlsx.full.min.js");
      const workbook = self.XLSX.read(data.buffer, { type: "array", cellDates: true, raw: true });
      matrices = {};
      for (let index = 0; index < workbook.SheetNames.length; index++) {
        const name = workbook.SheetNames[index];
        self.postMessage({ progress: `Preparando aba ${index + 1} de ${workbook.SheetNames.length}…` });
        matrices[name] = self.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: "" });
      }
      self.postMessage({ progress: "Consolidando os dados…" });
      const table = findTable(matrices, data.platforms);
      self.postMessage({ id: data.id, result: { table, sheets: workbook.SheetNames } });
    } else {
      const table = findTable(matrices, data.platforms, data.platformKey, data.name);
      self.postMessage({ id: data.id, result: table });
    }
  } catch (error) { self.postMessage({ id: data.id, error: error.message || "Não foi possível ler a planilha." }); }
};
