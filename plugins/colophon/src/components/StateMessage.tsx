import { Alert, Box, Button, Flex, Skeleton, Text } from '@backstage/ui';
import type { ReactNode } from 'react';

/**
 * - `loading`: something is on its way; announced politely, shaped like text.
 * - `empty`: nothing there yet, which is a normal stage of rollout.
 * - `notFound`: the thing asked for does not exist. Neutral rather than red —
 *   a stale link is not a malfunction, and styling it as one sends readers to
 *   report a bug that is not there.
 * - `error`: something actually failed.
 */
export type StateVariant = 'loading' | 'empty' | 'notFound' | 'error';

export interface StateMessageProps {
  title: string;
  detail?: ReactNode;
  /** Implies `variant="error"` unless a variant is given. */
  error?: Error;
  variant?: StateVariant;
  /** Links or buttons that get the reader out of a dead end. */
  actions?: ReactNode;
  /** Adds a Retry button to an error state. */
  onRetry?: () => void;
}

/** Wide enough to read, narrow enough not to stretch a one-line message. */
const MAX_WIDTH = '40rem';

/**
 * Loading, empty, not-found and error states in one place.
 *
 * An annotated entity whose docs have not been published yet is the common
 * case during rollout, and it must read as "not yet" rather than as a broken
 * page — an endless spinner or a stack trace both suggest the wrong thing.
 *
 * The variant is explicit. Loading used to be inferred from a title ending in
 * an ellipsis, which meant rewording a message could silently turn it into a
 * skeleton, or a skeleton into a message.
 */
export function StateMessage({
  title,
  detail,
  error,
  variant = error ? 'error' : 'empty',
  actions,
  onRetry,
}: StateMessageProps) {
  if (variant === 'loading') {
    return (
      <Box role="status" aria-busy="true" style={{ maxWidth: MAX_WIDTH }}>
        <Text as="div">{title}</Text>
        <Skeleton style={{ height: '1rem', marginTop: '0.75rem' }} />
        <Skeleton
          style={{ height: '1rem', marginTop: '0.5rem', width: '70%' }}
        />
      </Box>
    );
  }

  if (variant === 'error') {
    const customActions =
      onRetry || actions ? (
        <>
          {onRetry && (
            <Button variant="secondary" size="small" onPress={onRetry}>
              Retry
            </Button>
          )}
          {actions}
        </>
      ) : undefined;
    return (
      <Alert
        role="alert"
        status="danger"
        icon
        title={title}
        description={
          <>
            {detail ?? 'Something went wrong. Try again in a moment.'}
            {error && (
              // Kept, but out of the headline: the message is for whoever
              // files the bug, not for the reader trying to find a page.
              <details style={{ marginTop: '0.5rem' }}>
                <summary>Technical details</summary>
                {error.message}
              </details>
            )}
          </>
        }
        customActions={customActions}
        style={{ maxWidth: MAX_WIDTH }}
      />
    );
  }

  // Block-level on purpose: BUI's Text is inline by default, and a title and
  // its detail rendered as one unbroken run of text ("Nothing published
  // yetRun colophon…").
  return (
    <Flex direction="column" gap="2" style={{ maxWidth: MAX_WIDTH }}>
      <Text variant="title-small" as="div">
        {title}
      </Text>
      {detail && (
        <Text color="secondary" as="div">
          {detail}
        </Text>
      )}
      {actions && (
        <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
          {actions}
        </Flex>
      )}
    </Flex>
  );
}
