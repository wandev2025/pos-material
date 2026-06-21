import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type CommandPaletteProps<T> = {
  visible: boolean;
  onClose: () => void;
  items: T[];
  loading?: boolean;
  isDesktop?: boolean;
  placeholder?: string;
  emptyText?: string;
  keyExtractor: (item: T) => string | number;
  getLabel: (item: T) => string;
  getSubtitle?: (item: T) => string;
  getGroup?: (item: T) => string;          // optional category grouping → section headers + chips
  favorites?: T[];                         // optional pinned section when the search is empty
  favoritesTitle?: string;
  isSelected?: (item: T) => boolean;        // shows a green check
  onSelect: (item: T) => void;
  getCount?: (item: T) => number;           // qty already in cart → shows an inline − qty + stepper
  onRemove?: (item: T) => void;             // decrement / remove from cart
  keepOpenOnSelect?: boolean;               // multi-add (POS cart); others close on pick
  allowCreate?: boolean;                    // free-text create (e.g. a new supplier name)
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  footer?: React.ReactNode;
  embedded?: boolean;                       // render as an absolute overlay instead of a Modal (so it can stack over another modal)
};

// A reusable command-palette / searchable picker. Search on top, optional
// category chips + grouped sections, optional "type a new name" create row.
export default function CommandPalette<T>({
  visible, onClose, items, loading, isDesktop, placeholder = 'Cari...', emptyText = 'Tidak ada hasil.',
  keyExtractor, getLabel, getSubtitle, getGroup, favorites, favoritesTitle = 'Favorit',
  isSelected, onSelect, getCount, onRemove, keepOpenOnSelect, allowCreate, onCreate, createLabel, footer, embedded,
}: CommandPaletteProps<T>) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');

  // Reset the search each time it opens.
  useEffect(() => { if (visible) { setQuery(''); setGroup('all'); } }, [visible]);

  // Esc closes (web).
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const groups = useMemo(() => {
    if (!getGroup) return [] as string[];
    const s = new Set<string>();
    items.forEach(i => s.add(getGroup(i)));
    return ['all', ...[...s].sort((a, b) => a.localeCompare(b))];
  }, [items, getGroup]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return [{ title: 'Hasil', items: items.filter(i => getLabel(i).toLowerCase().includes(q)) }];
    if (getGroup && group !== 'all') return [{ title: group, items: items.filter(i => getGroup(i) === group) }];
    const secs: { title: string; items: T[] }[] = [];
    if (favorites && favorites.length) secs.push({ title: favoritesTitle, items: favorites });
    if (getGroup) {
      const byG = new Map<string, T[]>();
      items.forEach(i => { const g = getGroup(i); if (!byG.has(g)) byG.set(g, []); byG.get(g)!.push(i); });
      [...byG.keys()].sort((a, b) => a.localeCompare(b)).forEach(g => secs.push({ title: g, items: byG.get(g)! }));
    } else {
      secs.push({ title: '', items });
    }
    return secs;
  }, [items, query, group, getGroup, favorites, favoritesTitle, getLabel]);

  const trimmed = query.trim();
  const exactMatch = items.some(i => getLabel(i).toLowerCase() === trimmed.toLowerCase());
  const showCreate = !!allowCreate && trimmed.length > 0 && !exactMatch;
  const firstItem = sections.find(s => s.items.length)?.items[0];
  const empty = sections.every(s => s.items.length === 0);

  const pick = (item: T) => { onSelect(item); if (!keepOpenOnSelect) onClose(); };
  const create = () => { onCreate?.(trimmed); if (!keepOpenOnSelect) onClose(); };
  const onSubmit = () => { if (firstItem) pick(firstItem); else if (showCreate) create(); };

  const body = (
      <AnimatedPressable entering={FadeIn.duration(110)} style={styles.overlay} onPress={onClose}>
        <AnimatedPressable
          entering={FadeInDown.springify().damping(20).stiffness(300).mass(0.55).withInitialValues({ transform: [{ translateY: 12 }] })}
          style={[styles.card, isDesktop && { width: 620 }]}
          onPress={() => {}}
        >
          <View style={styles.searchRow}>
            <Ionicons name="search" size={20} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder={placeholder}
              placeholderTextColor="#94A3B8"
              value={query}
              onChangeText={setQuery}
              autoFocus
              onSubmitEditing={onSubmit}
              returnKeyType={showCreate ? 'done' : 'search'}
            />
            <TouchableOpacity onPress={onClose} style={styles.escBtn}><Text style={styles.escText}>ESC</Text></TouchableOpacity>
          </View>

          {groups.length > 0 && (
            <View style={styles.chipRow}>
              {groups.map(g => (
                <TouchableOpacity key={g} onPress={() => { setGroup(g); setQuery(''); }} style={[styles.chip, group === g && styles.chipActive]}>
                  <Text style={[styles.chipText, group === g && styles.chipTextActive]}>{g === 'all' ? 'Semua' : g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 40 }} color="#DC2626" />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: isDesktop ? 400 : 420 }}>
              {showCreate && (
                <TouchableOpacity style={[styles.item, styles.createItem]} onPress={create}>
                  <View style={[styles.itemIcon, { backgroundColor: '#FEF2F2' }]}><Ionicons name="add" size={18} color="#DC2626" /></View>
                  <Text style={styles.createText}>{createLabel ? createLabel(trimmed) : `Tambah "${trimmed}"`}</Text>
                </TouchableOpacity>
              )}
              {empty && !showCreate ? (
                <Text style={styles.empty}>{emptyText}</Text>
              ) : sections.map(section => section.items.length === 0 ? null : (
                <View key={section.title || 'flat'}>
                  {section.title ? <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text> : null}
                  {section.items.map(item => {
                    const count = getCount ? getCount(item) : 0;
                    return (
                      <View key={keyExtractor(item)} style={[styles.item, count > 0 && styles.itemInCart]}>
                        <TouchableOpacity style={styles.itemTap} onPress={() => pick(item)} activeOpacity={0.6}>
                          <View style={styles.itemIcon}><Ionicons name="cube-outline" size={18} color="#64748B" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName} numberOfLines={1}>{getLabel(item)}</Text>
                            {getSubtitle ? <Text style={styles.itemMeta} numberOfLines={1}>{getSubtitle(item)}</Text> : null}
                          </View>
                        </TouchableOpacity>
                        {keepOpenOnSelect && getCount ? (
                          count > 0 ? (
                            <View style={styles.stepper}>
                              <TouchableOpacity onPress={() => onRemove?.(item)} style={styles.stepBtn}><Ionicons name="remove" size={16} color="#DC2626" /></TouchableOpacity>
                              <Text style={styles.stepCount}>{count}</Text>
                              <TouchableOpacity onPress={() => pick(item)} style={styles.stepBtn}><Ionicons name="add" size={16} color="#16A34A" /></TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity onPress={() => pick(item)} style={{ paddingLeft: 8 }}><Ionicons name="add-circle" size={24} color="#DC2626" /></TouchableOpacity>
                          )
                        ) : (
                          <>
                            {isSelected?.(item) && <Ionicons name="checkmark-circle" size={18} color="#16A34A" style={{ marginRight: 6 }} />}
                            <Ionicons name={keepOpenOnSelect ? 'add-circle' : 'chevron-forward'} size={keepOpenOnSelect ? 24 : 18} color={keepOpenOnSelect ? '#DC2626' : '#CBD5E1'} />
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </AnimatedPressable>
      </AnimatedPressable>
  );

  if (embedded) return visible ? <View style={styles.embeddedFill}>{body}</View> : null;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  embeddedFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', paddingTop: 70, paddingHorizontal: 16 },
  card: { width: '100%', maxHeight: '85%', backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 56, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  searchInput: { flex: 1, fontSize: 16, color: '#0F172A', outlineStyle: 'none' as any },
  escBtn: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F8FAFC' },
  escText: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  chipTextActive: { color: '#FFF' },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  itemInCart: { backgroundColor: '#FEF9F9' },
  itemTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4 },
  stepBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  stepCount: { fontSize: 14, fontWeight: '800', color: '#0F172A', minWidth: 18, textAlign: 'center' },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  itemName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  itemMeta: { fontSize: 11, color: '#64748B', marginTop: 2 },
  createItem: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  createText: { flex: 1, fontSize: 14, fontWeight: '800', color: '#DC2626' },
  empty: { textAlign: 'center', color: '#94A3B8', fontWeight: '600', paddingVertical: 40 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', backgroundColor: '#F8FAFC' },
});
