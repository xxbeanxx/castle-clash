import { Button, Modal } from "./kit/index.js";

/**
 * Signing out as a guest throws the guest account away: nothing links it to anything, so its stats,
 * unlocks and loadout can't be recovered afterwards. Both places that offer Sign out (the header menu
 * and `/account`) ask first.
 */
export function GuestSignOutModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Sign out as a guest?"
      onClose={onCancel}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Sign out anyway
          </Button>
        </>
      }
    >
      <p>
        This guest’s stats, unlocks and loadout stay behind and can’t be recovered from this browser
        afterwards.
      </p>
      <p>To keep them, cancel and save your progress with Google first.</p>
    </Modal>
  );
}
