import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  FREQUENCIES,
  FREQUENCY_KEYS,
  PRESCRIPTION_DEFAULT_VALID_DAYS,
  suggestQuantity,
  type MedicineForm,
  type MedicineSummary,
  type Prescription,
  type PrescriptionItemInput,
} from '@telecare/shared';
import { PrescriptionView } from '@/features/prescriptions/PrescriptionView';
import {
  useConsultationPrescriptions,
  useMedicineSearch,
  usePrescriptionActions,
} from '@/features/prescriptions/prescription-queries';
import { ICONS } from '@/features/shell/icons';
import { errorMessage } from '@/lib/errors';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  QueryState,
  Screen,
  Skeleton,
  TextField,
  colors,
  radius,
  spacing,
} from '@/ui';

const DOSE_FOR: Record<MedicineForm, string> = {
  TABLET: '1 tablet',
  CAPSULE: '1 capsule',
  SYRUP: '5 ml',
  INJECTION: '1 injection',
  OINTMENT: 'Apply a thin layer',
  DROPS: '2 drops',
  INHALER: '2 puffs',
  OTHER: '1 dose',
};
const DOSES = ['1/2 tablet', '1 tablet', '2 tablets', '1 capsule', '5 ml', '10 ml'];
const DAYS = [3, 5, 7, 10, 14, 30];
const NOTES = ['After food', 'Before food', 'With warm water'];
const VALIDITY = [7, 15, PRESCRIPTION_DEFAULT_VALID_DAYS];

const newItem = (
  name: string,
  medicineId: string | null,
  form: MedicineForm = 'OTHER',
): PrescriptionItemInput => ({
  medicineId,
  medicineName: name,
  dosage: DOSE_FOR[form],
  frequency: 'TWICE_A_DAY',
  durationDays: 5,
  quantity: suggestQuantity('TWICE_A_DAY', 5),
  instructions: null,
});

function AddMedicine({ onAdd }: { onAdd: (item: PrescriptionItemInput) => void }) {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 300);
  const results = useMedicineSearch(q);
  const pick = (item: PrescriptionItemInput) => {
    onAdd(item);
    setText('');
  };
  return (
    <Card>
      <TextField
        label="Add a medicine"
        placeholder="Type at least 2 letters"
        value={text}
        onChangeText={setText}
        autoCorrect={false}
      />
      {(results.data ?? []).map((m: MedicineSummary) => (
        <Pressable
          key={m.id}
          accessibilityRole="button"
          accessibilityLabel={`Add ${m.name}`}
          onPress={() => pick(newItem(m.name, m.id, m.form))}
          style={({ pressed }) => [styles.result, pressed && { backgroundColor: colors.primarySoft }]}
        >
          <AppText variant="label">{m.name}</AppText>
          <AppText variant="small" color="textMuted">
            {[m.genericName, m.packSize, m.inStock ? 'In stock' : 'Out of stock'].filter(Boolean).join(' · ')}
          </AppText>
        </Pressable>
      ))}
      {q.length >= 2 && (
        <Button
          label={`Add "${q}" as written (not in catalog)`}
          variant="ghost"
          icon={ICONS.edit}
          onPress={() => pick(newItem(q, null))}
        />
      )}
    </Card>
  );
}

function ItemEditor({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: PrescriptionItemInput;
  index: number;
  onChange: (i: PrescriptionItemInput) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<PrescriptionItemInput>) => {
    const next = { ...item, ...patch };
    // Keep the quantity in step with the course unless the doctor typed their own.
    if (
      ('frequency' in patch || 'durationDays' in patch) &&
      item.quantity === suggestQuantity(item.frequency, item.durationDays)
    )
      next.quantity = suggestQuantity(next.frequency, next.durationDays);
    onChange(next);
  };
  return (
    <Card>
      <AppText variant="heading">
        {index + 1}. {item.medicineName}
      </AppText>
      {item.medicineId === null && (
        <AppText variant="small" color="warning">
          Not in the pharmacy catalog: the patient will buy it elsewhere.
        </AppText>
      )}
      <AppText variant="label">How much each time</AppText>
      <View style={styles.wrap}>
        {DOSES.map((d) => (
          <Chip key={d} label={d} selected={item.dosage === d} onPress={() => set({ dosage: d })} />
        ))}
      </View>
      <TextField label="Or type the dose" value={item.dosage} onChangeText={(dosage) => set({ dosage })} />
      <AppText variant="label">How often</AppText>
      <View style={styles.wrap}>
        {FREQUENCY_KEYS.map((f) => (
          <Chip
            key={f}
            label={FREQUENCIES[f].label}
            selected={item.frequency === f}
            onPress={() => set({ frequency: f })}
          />
        ))}
      </View>
      <AppText variant="label">For how many days</AppText>
      <View style={styles.wrap}>
        {DAYS.map((d) => (
          <Chip
            key={d}
            label={`${d} days`}
            selected={item.durationDays === d}
            onPress={() => set({ durationDays: d })}
          />
        ))}
      </View>
      <TextField
        label="Quantity to dispense"
        hint="Filled in from the dose and days. Change it if needed."
        keyboardType="number-pad"
        value={String(item.quantity)}
        onChangeText={(t) =>
          set({ quantity: Math.max(1, Math.min(1000, Number(t.replace(/\D/g, '')) || 1)) })
        }
      />
      <AppText variant="label">Note</AppText>
      <View style={styles.wrap}>
        {NOTES.map((n) => (
          <Chip
            key={n}
            label={n}
            selected={item.instructions === n}
            onPress={() => set({ instructions: item.instructions === n ? null : n })}
          />
        ))}
      </View>
      <Button label="Remove this medicine" variant="ghost" icon={ICONS.cancel} onPress={onRemove} />
    </Card>
  );
}

function Composer({ draft, consultationId }: { draft: Prescription; consultationId: string }) {
  const actions = usePrescriptionActions(consultationId);
  const [items, setItems] = useState<PrescriptionItemInput[]>(
    draft.items.map(({ id: _id, inCatalog: _c, ...rest }) => rest),
  );
  const [advice, setAdvice] = useState(draft.generalInstructions ?? '');
  const [validDays, setValidDays] = useState(draft.validDays);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const body = () => ({ items, generalInstructions: advice.trim() || null, validDays });
  const error = actions.save.error ?? actions.issue.error;
  const busy = actions.save.isPending || actions.issue.isPending;

  const issue = async () => {
    await actions.save.mutateAsync({ id: draft.id, body: body() });
    await actions.issue.mutateAsync(draft.id);
  };

  return (
    <>
      {draft.supersedesId && (
        <Banner tone="info" message="This corrects a prescription you withdrew. Check it, then issue it." />
      )}
      {items.map((item, i) => (
        <ItemEditor
          key={`${item.medicineName}-${i}`}
          item={item}
          index={i}
          onChange={(next) => {
            setSaved(false);
            setItems((list) => list.map((x, j) => (j === i ? next : x)));
          }}
          onRemove={() => setItems((list) => list.filter((_, j) => j !== i))}
        />
      ))}
      <AddMedicine onAdd={(item) => setItems((list) => [...list, item])} />
      <TextField
        label="Advice for the patient (optional)"
        value={advice}
        onChangeText={setAdvice}
        multiline
        maxLength={1000}
      />
      <AppText variant="label">Valid for</AppText>
      <View style={styles.wrap}>
        {VALIDITY.map((d) => (
          <Chip key={d} label={`${d} days`} selected={validDays === d} onPress={() => setValidDays(d)} />
        ))}
      </View>

      {error !== null && <Banner tone="danger" message={errorMessage(error)} />}
      {saved && <Banner tone="success" message="Draft saved. The patient can't see it until you issue it." />}
      <Button
        label="Save draft"
        variant="secondary"
        icon={ICONS.check}
        loading={actions.save.isPending && !confirming}
        onPress={() =>
          actions.save.mutate({ id: draft.id, body: body() }, { onSuccess: () => setSaved(true) })
        }
      />
      {confirming ? (
        <Card style={{ backgroundColor: colors.accentSoft }}>
          <AppText variant="label">
            {"Issue to the patient? After this it can't be changed, only withdrawn."}
          </AppText>
          <Button
            label="Yes, issue it"
            icon={ICONS.check}
            loading={busy}
            onPress={() => void issue().catch(() => undefined)}
          />
          <Button label="Not yet" variant="ghost" onPress={() => setConfirming(false)} />
        </Card>
      ) : (
        <Button
          label="Issue prescription"
          icon={ICONS.medicines}
          disabled={items.length === 0}
          onPress={() => setConfirming(true)}
        />
      )}
    </>
  );
}

function Issued({ prescription, consultationId }: { prescription: Prescription; consultationId: string }) {
  const actions = usePrescriptionActions(consultationId);
  const [reason, setReason] = useState('');
  const short = reason.trim().length < 3;
  return (
    <>
      <Banner tone="success" message="Issued. The patient has it in their chat and their Medicines tab." />
      <PrescriptionView prescription={prescription} />
      <Card>
        <AppText variant="label">Need to correct it?</AppText>
        <TextField
          label="Reason (the patient sees this)"
          value={reason}
          onChangeText={setReason}
          maxLength={200}
        />
        {actions.voidIt.error && <Banner tone="danger" message={errorMessage(actions.voidIt.error)} />}
        <Button
          label="Withdraw and write a corrected one"
          variant="secondary"
          icon={ICONS.edit}
          disabled={short}
          loading={actions.voidIt.isPending}
          onPress={() => actions.voidIt.mutate({ id: prescription.id, reason: reason.trim(), revise: true })}
        />
        <Button
          label="Withdraw only"
          variant="danger"
          icon={ICONS.cancel}
          disabled={short}
          onPress={() => actions.voidIt.mutate({ id: prescription.id, reason: reason.trim(), revise: false })}
        />
      </Card>
    </>
  );
}

/** The doctor's prescription for one consultation: start, write, issue, correct. */
export default function PrescriptionScreen() {
  const { consultationId } = useLocalSearchParams<{ consultationId: string }>();
  const list = useConsultationPrescriptions(consultationId);
  const { openDraft } = usePrescriptionActions(consultationId);
  return (
    <Screen>
      <QueryState query={list} loading={<Skeleton cards={2} />}>
        {(all) => {
          const draft = all.find((p) => p.status === 'DRAFT');
          const issued = all.find((p) => p.status === 'ISSUED');
          if (draft) return <Composer key={draft.id} draft={draft} consultationId={consultationId} />;
          if (issued) return <Issued prescription={issued} consultationId={consultationId} />;
          return (
            <>
              <AppText>No prescription yet for this consultation.</AppText>
              {openDraft.error !== null && <Banner tone="danger" message={errorMessage(openDraft.error)} />}
              <Button
                label="Start a prescription"
                icon={ICONS.medicines}
                loading={openDraft.isPending}
                onPress={() => openDraft.mutate()}
              />
              <Button label="Back to the consultation" variant="ghost" onPress={() => router.back()} />
            </>
          );
        }}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  result: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md, gap: 2 },
});
