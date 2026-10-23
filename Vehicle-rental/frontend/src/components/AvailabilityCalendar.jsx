import { useMemo } from "react";

export default function AvailabilityCalendar({ month = new Date(), blockedDates = [], startDate, endDate, onSelect }) {
  const days = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const leading = new Date(year, monthIndex, 1).getDay();
    const count = new Date(year, monthIndex + 1, 0).getDate();
    return [...Array(leading).fill(null), ...Array.from({ length: count }, (_, index) => new Date(year, monthIndex, index + 1))];
  }, [month]);
  const blocked = new Set(blockedDates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const toDate = value => value ? new Date(`${value}T00:00:00`) : null;
  const start = toDate(startDate);
  const end = toDate(endDate);

  return (
    <div className="availability-calendar" role="group" aria-label="Vehicle availability calendar">
      <div className="calendar-month">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
      <div className="calendar-grid calendar-weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-grid">{days.map((day, index) => {
        if (!day) return <span className="calendar-day blank" key={`blank-${index}`} />;
        const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        const unavailable = blocked.has(key) || day < today;
        const selected = (start && day.getTime() === start.getTime()) || (end && day.getTime() === end.getTime());
        const inRange = start && end && day > start && day < end;
        return <button key={key} type="button" className={`calendar-day${unavailable ? " blocked" : ""}${selected ? " selected" : ""}${inRange ? " in-range" : ""}`} disabled={unavailable} onClick={() => onSelect?.(key)} aria-label={`${key}${unavailable ? ", unavailable" : ""}`}>{day.getDate()}</button>;
      })}</div>
    </div>
  );
}
