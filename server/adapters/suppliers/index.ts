export { PrintfulAdapter, printfulAdapter, type PrintfulProduct } from "./printfulAdapter";
export { CJAdapter, cjAdapter, type CJProduct } from "./cjAdapter";

export const SUPPLIERS = {
  printful: "printful",
  cjdropshipping: "cjdropshipping",
} as const;

export type SupplierType = (typeof SUPPLIERS)[keyof typeof SUPPLIERS];
