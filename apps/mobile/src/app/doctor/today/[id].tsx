import { useLocalSearchParams } from 'expo-router';
import { AppointmentDetail } from '@/features/appointments/AppointmentDetail';

export default function DoctorAppointment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AppointmentDetail id={id} viewer="DOCTOR" />;
}
