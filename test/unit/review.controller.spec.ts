import { ReviewController } from '../../src/review/review.controller';
import { ReviewService } from '../../src/review/review.service';

describe('ReviewController', () => {
  let controller: ReviewController;
  let reviewService: { runReview: jest.Mock };

  beforeEach(() => {
    reviewService = { runReview: jest.fn() };
    controller = new ReviewController(reviewService as unknown as ReviewService);
  });

  describe('runReview', () => {
    it('should delegate to reviewService.runReview with correct args', async () => {
      const dto = { gitlab: { project_path: 'g/p', mr_iid: 1 }, review: { profile: 'default' } };
      const req = { requestId: 'req-1', client: { client_id: 'c1' } };
      const expected = { request_id: 'req-1', status: 'ok' };
      reviewService.runReview.mockResolvedValue(expected);

      const result = await controller.runReview(dto as any, req as any, 'idem-key');

      expect(reviewService.runReview).toHaveBeenCalledWith(
        dto,
        'req-1',
        { client_id: 'c1' },
        'idem-key',
      );
      expect(result).toEqual(expected);
    });

    it('should pass undefined when idempotency key is not provided', async () => {
      const dto = { gitlab: { project_path: 'g/p', mr_iid: 1 } };
      const req = { requestId: 'req-2', client: { client_id: 'c2' } };
      reviewService.runReview.mockResolvedValue({});

      await controller.runReview(dto as any, req as any, undefined);

      expect(reviewService.runReview).toHaveBeenCalledWith(
        dto,
        'req-2',
        { client_id: 'c2' },
        undefined,
      );
    });
  });

  describe('getHelp', () => {
    it('should return help object with service name and endpoints', () => {
      const help = controller.getHelp();

      expect(help.service).toBe('AI Review Service');
      expect(help.version).toBe('v1');
      expect(help.endpoints).toBeDefined();
      expect(help.endpoints['POST /api/v1/reviews/run']).toBeDefined();
      expect(help.authentication).toBeDefined();
      expect(help.review_profiles).toContain('default');
      expect(help.review_profiles).toContain('security');
      expect(help.review_profiles).toContain('thorough');
    });
  });
});
