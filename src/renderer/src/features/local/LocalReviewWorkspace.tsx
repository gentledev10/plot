import type { LocalTarget } from '@shared/local';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../app/providers';
import { useLocalDiff } from '../diff/queries';
import { LocalReviewPanel, type LocalReviewPanelProps } from './LocalReviewPanel';
import { localKeys } from './queries';

type Props = Omit<LocalReviewPanelProps, 'files' | 'signature'> & { target: LocalTarget };

export function LocalReviewWorkspace(props: Props) {
  const api = useApi();
  const diff = useLocalDiff(props.target);
  const signature = useQuery({
    queryKey: localKeys.signature(props.target),
    queryFn: () => api.getLocalSignature(props.target),
    enabled: props.target.compare !== 'commits' || Boolean(props.target.commits?.length),
  });
  return <LocalReviewPanel {...props} files={diff.data?.files ?? []} signature={signature.data} />;
}
