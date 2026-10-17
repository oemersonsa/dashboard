const known = value => Number.isSafeInteger(value) && value >= 0;
const cents = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
const COST_FIELDS = ["productCostCents", "packagingCents", "taxCents", "otherCents", "feeOverrideCents", "shippingOverrideCents", "productRefundCents"];

function catalogCosts(order, products = []) {
  products = Array.isArray(products) ? products.filter(product => product && typeof product === "object") : [];
  const matches = (order.items || []).map(item => {
    const sku = String(item.sku || "").trim().toLocaleLowerCase("pt-BR");
    const found = sku ? products.filter(product => String(product.sku || "").trim().toLocaleLowerCase("pt-BR") === sku) : [];
    return { item, product: found.length === 1 ? found[0] : null };
  });
  const sum = field => matches.length && matches.every(({ item, product }) => product && cents(product[field]) !== null && Number.isInteger(item.quantity) && item.quantity > 0)
    ? matches.reduce((total, { item, product }) => total + cents(product[field]) * item.quantity, 0) : null;
  return { productCostCents: sum("productCost"), packagingCents: sum("packagingCost"),
    matched: matches.filter(match => match.product).length, items: matches.length };
}
function calculate(order, financial = {}, settings = {}, products = []) {
  const catalog = catalogCosts(order, products);
  const choose = (field, fallback) => known(settings[field]) ? settings[field] : known(fallback) ? fallback : null;
  const apiFee = known(financial.billing?.saleFeeCents) ? financial.billing.saleFeeCents : order.saleFeeCents;
  const costs = {
    feeCents: choose("feeOverrideCents", apiFee), shippingCents: choose("shippingOverrideCents", financial.shipping?.costCents),
    productCostCents: choose("productCostCents", catalog.productCostCents), packagingCents: choose("packagingCents", catalog.packagingCents),
    taxCents: choose("taxCents", null), otherCents: choose("otherCents", null),
    productRefundCents: choose("productRefundCents", order.refundsKnown && order.refundedCents === 0 ? 0 : null)
  };
  const selected = new Set(settings.includedChargeIds || []);
  const charges = financial.billing?.charges || [];
  const included = charges.filter(charge => selected.has(charge.id) && charge.selectable);
  const extraCents = included.reduce((sum, charge) => sum + charge.signedCents, 0);
  const missing = Object.entries(costs).filter(([, value]) => value === null).map(([field]) => field);
  if (!settings.reviewed) missing.push("review");
  if (included.length !== selected.size) missing.push("charges");
  const eligible = order.status === "paid" && order.currency === "BRL" && known(order.grossCents);
  const knownCostsCents = Object.values(costs).reduce((sum, value) => sum + (value || 0), 0) + extraCents;
  const ready = eligible && !missing.length;
  const resultCents = ready ? order.grossCents - knownCostsCents : null;
  return { costs, catalog, extraCents, knownCostsCents, ready, missing, eligible,
    profitCents: resultCents, marginPercent: resultCents !== null && order.grossCents > 0 ? resultCents / order.grossCents * 100 : null,
    estimated: ready && (financial.billing?.status !== "available" || !known(financial.billing?.saleFeeCents) || financial.shipping?.allocated === true),
    sources: { fee: known(settings.feeOverrideCents) ? "manual" : known(financial.billing?.saleFeeCents) ? "billing" : "order",
      shipping: known(settings.shippingOverrideCents) ? "manual" : financial.shipping?.allocated ? "allocated" : "shipment",
      product: known(settings.productCostCents) ? "manual" : "sku", packaging: known(settings.packagingCents) ? "manual" : "sku" } };
}
module.exports = { calculate, catalogCosts, COST_FIELDS, known, cents };
