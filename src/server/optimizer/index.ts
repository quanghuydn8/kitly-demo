// Basket Optimizer (seam S1). Pure code: no I/O, no LLM.
export { optimize, optimizeProfile } from "./optimize";
export { fitToBudget, type FitBasket } from "./fit";
export { priceBasket, usableCandidates, type BasketPrice, type OptimizerInput } from "./context";
export { formatVnd } from "./labels";
