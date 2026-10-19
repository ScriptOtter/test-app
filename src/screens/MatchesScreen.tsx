import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FavoriteButton } from '../components/FavoriteButton';
import { UpdatedAgo } from '../components/UpdatedAgo';
import { MATCHES_URL } from '../config';
import { useFavorites } from '../hooks/useFavorites';

type Team = { id: string; name: string; city: string };
type Score = { home: number; away: number };

export type Match = {
  id: string;
  startsAt: string | null;
  status: string;
  minute?: number;
  home: Team;
  away: Team;
  score: Score | null;
};

type Filter = 'all' | 'upcoming' | 'finished';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'upcoming', label: 'Предстоящие' },
  { id: 'finished', label: 'Завершённые' },
];

function statusLabel(match: Match): string {
  switch (match.status) {
    case 'finished':
      return 'Завершён';
    case 'live':
      return typeof match.minute === 'number' ? `Идёт · ${match.minute}'` : 'Идёт';
    case 'scheduled':
      return 'Не начался';
    case 'postponed':
      return 'Перенесён';
    default:
      return match.status;
  }
}

function statusTone(status: string) {
  switch (status) {
    case 'live':
      return { badge: styles.statusLive, text: styles.statusLiveText, card: styles.cardLive };
    case 'finished':
      return { badge: styles.statusFinished, text: styles.statusFinishedText, card: styles.cardFinished };
    case 'scheduled':
      return { badge: styles.statusScheduled, text: styles.statusScheduledText, card: styles.cardScheduled };
    case 'postponed':
      return { badge: styles.statusPostponed, text: styles.statusPostponedText, card: styles.cardPostponed };
    default:
      return { badge: styles.statusUnknown, text: styles.statusUnknownText, card: undefined };
  }
}

function formatKickoff(startsAt: string | null): string {
  if (!startsAt) {
    return 'Время не назначено';
  }

  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return 'Время неизвестно';
  }

  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function matchesFilter(match: Match, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'upcoming') return match.status === 'scheduled';
  if (filter === 'finished') return match.status === 'finished';
  return true;
}

async function fetchMatches(): Promise<Match[]> {
  const response = await fetch(MATCHES_URL);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Не удалось загрузить матчи (${response.status})`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Сервер вернул некорректный ответ');
  }

  const matches = (payload as { matches?: unknown })?.matches;
  if (!Array.isArray(matches)) {
    throw new Error('В ответе нет списка матчей');
  }

  return matches as Match[];
}

export function MatchesScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { isFavorite, toggle } = useFavorites();

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const next = await fetchMatches();
      setMatches(next);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить матчи');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return matches.filter((match) => {
      if (!matchesFilter(match, filter)) return false;
      if (!q) return true;

      const haystack = [
        match.home.name,
        match.home.city,
        match.away.name,
        match.away.city,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [matches, filter, query]);

  if (loading && matches.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Загружаем матчи…</Text>
      </View>
    );
  }

  if (error && matches.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Не получилось загрузить матчи</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => void load('initial')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Матчи тура</Text>

      <View style={styles.toolbar}>
        <Pressable
          onPress={() => void load('refresh')}
          accessibilityRole="button"
          disabled={refreshing}
        >
          <Text style={styles.refresh}>{refreshing ? 'Обновляем…' : 'Обновить'}</Text>
        </Pressable>
        {updatedAt ? <UpdatedAgo since={updatedAt} /> : null}
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск по команде"
          placeholderTextColor="#9ca3af"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Очистить поиск"
            style={styles.searchClear}
          >
            <Text style={styles.searchClearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.muted}>{error}</Text>
          <Pressable onPress={() => void load('refresh')} accessibilityRole="button">
            <Text style={styles.refresh}>Повторить</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.filters}>
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setFilter(item.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />
        }
        contentContainerStyle={visible.length === 0 ? styles.listEmpty : styles.list}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>
              {matches.length === 0
                ? 'Матчей пока нет'
                : query.trim()
                ? 'Ничего не найдено'
                : 'Нет матчей в этом фильтре'}
            </Text>
            <Text style={styles.muted}>
              {matches.length === 0
                ? 'Попробуйте обновить список позже'
                : query.trim()
                ? `По запросу «${query.trim()}» матчей нет`
                : 'Живые и перенесённые матчи видны во вкладке «Все»'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const tone = statusTone(item.status);
          return (
          <View style={[styles.card, tone.card]}>
            <View style={styles.cardHeader}>
              <View style={[styles.statusBadge, tone.badge]}>
                {item.status === 'live' ? <View style={styles.liveDot} /> : null}
                <Text style={[styles.status, tone.text]}>{statusLabel(item)}</Text>
              </View>
              <FavoriteButton active={isFavorite(item.id)} onPress={() => toggle(item.id)} />
            </View>
            <View style={styles.teams}>
              <Text style={styles.team}>{item.home.name}</Text>
              <Text style={styles.score}>
                {item.score ? `${item.score.home} : ${item.score.away}` : '—'}
              </Text>
              <Text style={[styles.team, styles.teamAway]}>{item.away.name}</Text>
            </View>
            <Text style={styles.kickoff}>{formatKickoff(item.startsAt)}</Text>
          </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  toolbar: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  refresh: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  searchClear: {
    padding: 4,
    marginLeft: 4,
  },
  searchClearText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  chipActive: {
    backgroundColor: '#111827',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  list: {
    paddingBottom: 24,
    gap: 10,
  },
  listEmpty: {
    flexGrow: 1,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 4,
  },
  cardLive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderLeftColor: '#16a34a',
  },
  cardFinished: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderLeftColor: '#9ca3af',
  },
  cardScheduled: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderLeftColor: '#2563eb',
  },
  cardPostponed: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderLeftColor: '#d97706',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  status: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusLive: {
    backgroundColor: '#dcfce7',
  },
  statusLiveText: {
    color: '#15803d',
  },
  statusFinished: {
    backgroundColor: '#e5e7eb',
  },
  statusFinishedText: {
    color: '#4b5563',
  },
  statusScheduled: {
    backgroundColor: '#dbeafe',
  },
  statusScheduledText: {
    color: '#1d4ed8',
  },
  statusPostponed: {
    backgroundColor: '#fef3c7',
  },
  statusPostponedText: {
    color: '#b45309',
  },
  statusUnknown: {
    backgroundColor: '#f3f4f6',
  },
  statusUnknownText: {
    color: '#4b5563',
  },
  teams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  team: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  teamAway: {
    textAlign: 'right',
  },
  score: {
    minWidth: 52,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  kickoff: {
    marginTop: 8,
    fontSize: 13,
    color: '#6b7280',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  muted: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  inlineError: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
});