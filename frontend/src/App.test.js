import { render, screen } from '@testing-library/react';
import App from './App';

test('renders MedVerify navbar brand', () => {
  render(<App />);
  const brandElement = screen.getByRole('link', { name: /medverify/i });
  expect(brandElement).toBeInTheDocument();
});
