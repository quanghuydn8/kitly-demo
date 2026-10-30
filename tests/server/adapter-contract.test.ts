import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { commerceAdapterContract } from "./contracts/commerce-adapter";

commerceAdapterContract("InMemoryAdapter", { make: () => new InMemoryAdapter() });
