import type { ClockPort } from '../../domain/ports/ClockPort';

export class SystemClockAdapter implements ClockPort {
  today(): Date {
    return new Date();
  }
}
