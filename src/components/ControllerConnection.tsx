import { type InputBinding } from '@dmx-controller/proto/controller_pb';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  ControlCommandType,
  ControllerChannel,
  ControllerContext,
} from '../contexts/ControllerContext';
import { ProjectContext } from '../contexts/ProjectContext';
import {
  BindingContext,
  assignAction,
  deleteAction,
  findBinding,
  getActionDescription,
  getAllBindingsForAction,
  hasAction,
} from '../external_controller/externalController';

import { Project } from '@dmx-controller/proto/project_pb';
import { BiPlus, BiTrash } from 'react-icons/bi';
import { Button, ControllerButton, IconButton } from './Button';
import { Modal } from './Modal';

import styles from './ControllerConnection.module.css';

interface ControllerConnectionProps {
  context: BindingContext;
  action: InputBinding;
  title: string;
  iconOnly?: boolean;
  requiredType?: 'slider' | 'button';
}

export function ControllerConnection({
  context,
  action,
  title,
  iconOnly,
  requiredType,
}: ControllerConnectionProps) {
  const { project } = useContext(ProjectContext);
  const { connectedDevices } = useContext(ControllerContext);

  const [showModal, setShowModal] = useState(false);

  const hasControllerMapping = useMemo(() => {
    return connectedDevices.some((d) =>
      hasAction(project, d.bindingId, action),
    );
  }, [project, connectedDevices, action]);

  if (connectedDevices.length === 0) {
    return null;
  }

  return (
    <>
      <ControllerButton
        title={title}
        iconOnly={iconOnly}
        midiState={hasControllerMapping ? 'active' : 'inactive'}
        onClick={() => setShowModal(true)}
      />

      {showModal && (
        <ControllerBindingModal
          context={context}
          action={action}
          title={title}
          requiredType={requiredType}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

interface ControllerBindingModalProps {
  context: BindingContext;
  action: InputBinding;
  title: string;
  requiredType?: 'slider' | 'button';
  onClose: () => void;
}

interface ConflictInfo {
  bindingId: bigint;
  channel: ControllerChannel;
  currentDescription: string;
}

function ControllerBindingModal({
  context,
  action,
  title,
  requiredType,
  onClose,
}: ControllerBindingModalProps) {
  const { project, save } = useContext(ProjectContext);
  const { connectedDevices, addListener, removeListener } =
    useContext(ControllerContext);

  const [bindings, setBindings] = useState<
    Array<{
      bindingId: bigint;
      channel: ControllerChannel;
      context: BindingContext;
    }>
  >([]);
  const [isAddingBinding, setIsAddingBinding] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [highlight, setHighlight] = useState<ControllerChannel | null>(null);

  // Track the bindingId used during conflict resolution
  const pendingConflictBindingId = useRef<bigint | null>(null);

  // Load bindings on mount and when project changes
  useEffect(() => {
    const connectedBindingIds = new Set(
      connectedDevices.map((d) => d.bindingId),
    );
    const allBindings = getAllBindingsForAction(project, action).filter((b) =>
      connectedBindingIds.has(b.bindingId),
    );
    setBindings(allBindings);
  }, [project, connectedDevices, action]);

  // Highlight effect when MIDI input is received
  useEffect(() => {
    const listener = (
      _project: Project,
      _bindingId: bigint,
      channel: ControllerChannel,
      _value: number,
      _cct: ControlCommandType,
    ) => {
      setHighlight(channel);
      setTimeout(() => {
        setHighlight(null);
      }, 10);
    };
    addListener(listener);

    return () => removeListener(listener);
  }, [addListener, removeListener]);

  // Listener for MIDI input during mapping — bindingId comes from the device
  useEffect(() => {
    if (isAddingBinding && connectedDevices.length > 0) {
      const listener = (
        project: Project,
        bindingId: bigint,
        channel: ControllerChannel,
        _value: number,
        cct: ControlCommandType,
      ) => {
        // Type validation
        if (cct != null && requiredType === 'button') {
          setError('Input must be a button!');
          setIsAddingBinding(false);
          return;
        }
        if (cct == null && requiredType === 'slider') {
          setError('Input must be a slider!');
          setIsAddingBinding(false);
          return;
        }

        // Check for conflicts
        const existing = findBinding(project, bindingId, channel, context);

        if (existing) {
          // Check if it's the same action
          const allBindings = getAllBindingsForAction(project, action);
          if (
            allBindings.some(
              (b) => b.bindingId === bindingId && b.channel === channel,
            )
          ) {
            setError('This channel is already bound to this action!');
            setIsAddingBinding(false);
            removeListener(listener);
            return;
          }

          // Channel is bound to a different action - show conflict modal
          const description = getActionDescription(
            project,
            project.activeScene,
            bindingId,
            channel,
          )!;
          pendingConflictBindingId.current = bindingId;
          setConflictInfo({
            bindingId,
            channel,
            currentDescription: description,
          });
          setIsAddingBinding(false);
          removeListener(listener);
          return;
        }

        // Add the binding
        if (cct == null || cct == 'msb') {
          assignAction(project, bindingId, channel, action);
          save('Add MIDI binding.');
          setIsAddingBinding(false);
        }

        removeListener(listener);
      };

      addListener(listener);
      return () => removeListener(listener);
    }
    return () => {};
  }, [
    isAddingBinding,
    connectedDevices,
    action,
    requiredType,
    project,
    save,
    addListener,
    removeListener,
  ]);

  if (connectedDevices.length === 0) {
    return null;
  }

  return (
    <>
      <Modal
        title={`MIDI Bindings: ${title}`}
        onClose={onClose}
        footer={<Button onClick={onClose}>Done</Button>}
      >
        {bindings.map(({ bindingId, channel }) => (
          <div
            key={`${bindingId}-${channel}`}
            className={`${styles.bindingRow} ${highlight === channel ? styles.active : ''}`}
          >
            <span>{channel}</span>
            <IconButton
              title="Remove binding"
              variant="warning"
              onClick={() => {
                deleteAction(project, bindingId, channel);
                save('Remove MIDI binding.');
              }}
            >
              <BiTrash />
            </IconButton>
          </div>
        ))}
        {bindings.length === 0 && (
          <div className={styles.noBindings}>No MIDI bindings.</div>
        )}
        {error && <div className={styles.warning}>{error}</div>}
        <div className={styles.addBinding}>
          <Button
            icon={<BiPlus />}
            onClick={() => {
              setIsAddingBinding(true);
              setError(undefined);
            }}
            disabled={isAddingBinding}
          >
            {isAddingBinding ? 'Move a controller input...' : 'Add Binding'}
          </Button>
        </div>
      </Modal>

      {conflictInfo && (
        <ConflictModal
          currentAction={conflictInfo.currentDescription}
          onReassign={() => {
            assignAction(
              project,
              conflictInfo.bindingId,
              conflictInfo.channel,
              action,
            );
            save('Reassign MIDI binding.');
            setConflictInfo(null);
            pendingConflictBindingId.current = null;
          }}
          onCancel={() => {
            setConflictInfo(null);
            pendingConflictBindingId.current = null;
          }}
        />
      )}
    </>
  );
}

interface ConflictModalProps {
  currentAction: string;
  onReassign: () => void;
  onCancel: () => void;
}

function ConflictModal({
  currentAction,
  onReassign,
  onCancel,
}: ConflictModalProps) {
  return (
    <Modal
      title="Controller Input Already Assigned"
      onClose={onCancel}
      footer={
        <div className={styles.buttonRow}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="warning" onClick={onReassign}>
            Reassign
          </Button>
        </div>
      }
    >
      <p>
        This controller input is currently assigned to{' '}
        <strong>"{currentAction}"</strong>.
      </p>
      <p>Do you want to reassign it?</p>
    </Modal>
  );
}
