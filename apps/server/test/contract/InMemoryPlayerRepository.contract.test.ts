import { InMemoryPlayerRepository } from "../../src/persistence/InMemoryPlayerRepository.js";
import { runPlayerRepositoryContractTests } from "./PlayerRepository.contract.js";

runPlayerRepositoryContractTests(
  () => new InMemoryPlayerRepository(),
  () => crypto.randomUUID(),
);
