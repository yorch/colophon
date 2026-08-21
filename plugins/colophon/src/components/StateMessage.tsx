import { Alert, Box, Skeleton, Text } from '@backstage/ui';

export interface StateMessageProps {
  title: string;
  detail?: string;
  error?: Error;
}

/**
 * Loading, empty and error states in one place.
 *
 * An annotated entity whose docs have not been published yet is the common
 * case during rollout, and it must read as "not yet" rather than as a broken
 * page — an endless spinner or a stack trace both suggest the wrong thing.
 */
export function StateMessage({ title, detail, error }: StateMessageProps) {
  if (error) {
    return <Alert status="danger" title={title} description={error.message} />;
  }

  if (title.endsWith('…')) {
    return (
      <Box>
        <Text>{title}</Text>
        <Skeleton style={{ height: '1rem', marginTop: '0.75rem' }} />
        <Skeleton style={{ height: '1rem', marginTop: '0.5rem' }} />
      </Box>
    );
  }

  return (
    <Box>
      <Text variant="title-small">{title}</Text>
      {detail && <Text color="secondary">{detail}</Text>}
    </Box>
  );
}
