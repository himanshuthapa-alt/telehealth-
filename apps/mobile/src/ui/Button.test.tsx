import { render, screen, userEvent } from '@testing-library/react-native';
import { Button } from './Button';

describe('Button', () => {
  it('shows its label and calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Book appointment" onPress={onPress} />);
    await userEvent.press(screen.getByRole('button', { name: 'Book appointment' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and busy while loading, and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="Confirm order" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Confirm order' });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    await userEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
