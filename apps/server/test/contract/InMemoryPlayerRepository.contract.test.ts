import { InMemoryPlayerRepository } from "../../src/persistence/InMemoryPlayerRepository.js";
import { runPlayerRepositoryContractTests } from "./PlayerRepository.contract.js";

runPlayerRepositoryContractTests(
  () => new InMemoryPlayerRepository(),
  () => crypto.randomUUID(),
  async (repo, userId, name) => {
    (repo as InMemoryPlayerRepository).seedDisplayName(userId, name);
  },
);
