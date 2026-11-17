import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Tracks whether the software keyboard is open.
 *
 * The tab bar is not useful while the assistant composer has focus, and on a
 * phone it would otherwise sit between the composer and the keyboard. The
 * shell removes it, then restores it when the keyboard closes.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
