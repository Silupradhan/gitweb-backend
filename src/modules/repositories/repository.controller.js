import { repositoryService } from './repository.service.js';

export const repositoryController = {
  /**
   * GET /repos - Return list of repositories with event counts (FR-5.6).
   */
  async listWithCounts(_req, res) {
    const repos = await repositoryService.listWithEventCounts();
    return res.status(200).json(repos);
  },
};

