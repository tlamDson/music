/**
 * Ví dụ TDD component test theo Red-Green-Refactor
 * Khi làm feature PlayerBar: copy pattern này
 */
describe('TDD Example', () => {
  it('test runner is configured correctly', () => {
    expect(1 + 1).toBe(2);
  });

  // Template cho component test thực:
  // describe('PlayerBar', () => {
  //   it('shows override button only for STORE_ADMIN role', () => {
  //     render(<PlayerBar role="STORE_ADMIN" />);
  //     expect(screen.getByRole('button', { name: /override/i })).toBeInTheDocument();
  //   });
  // });
});
