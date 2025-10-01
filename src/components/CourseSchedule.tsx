import { createSignal, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

interface Course {
  name: string;
  teacher: string;
  location: string;
  time_slot: string;
  weeks: string;
  day_of_week: number;
  start_section: number;
  end_section: number;
}

interface CourseSchedule {
  student_name: string;
  student_id: string;
  semester: string;
  courses: Course[];
}

interface WeekRange {
  start: number;
  end: number;
  oddOnly?: boolean;
  evenOnly?: boolean;
}

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const SECTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

// 解析周次字符串，例如："6-8周(双),9-18周" -> [{start: 6, end: 8, evenOnly: true}, {start: 9, end: 18}]
function parseWeeks(weekStr: string): WeekRange[] {
  if (!weekStr) return [];

  const ranges: WeekRange[] = [];
  const parts = weekStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    const oddMatch = trimmed.match(/(\d+)-(\d+)周\(单\)/);
    const evenMatch = trimmed.match(/(\d+)-(\d+)周\(双\)/);
    const rangeMatch = trimmed.match(/(\d+)-(\d+)周/);
    const singleWeekMatch = trimmed.match(/(\d+)周/);

    if (oddMatch) {
      ranges.push({
        start: parseInt(oddMatch[1]),
        end: parseInt(oddMatch[2]),
        oddOnly: true
      });
    } else if (evenMatch) {
      ranges.push({
        start: parseInt(evenMatch[1]),
        end: parseInt(evenMatch[2]),
        evenOnly: true
      });
    } else if (rangeMatch) {
      ranges.push({
        start: parseInt(rangeMatch[1]),
        end: parseInt(rangeMatch[2])
      });
    } else if (singleWeekMatch) {
      const week = parseInt(singleWeekMatch[1]);
      ranges.push({ start: week, end: week });
    }
  }

  return ranges;
}

// 检查某周是否在周次范围内
function isWeekInRange(week: number, ranges: WeekRange[]): boolean {
  return ranges.some(range => {
    if (week < range.start || week > range.end) return false;
    if (range.oddOnly && week % 2 === 0) return false;
    if (range.evenOnly && week % 2 === 1) return false;
    return true;
  });
}

export default function CourseSchedule() {
  const [schedule, setSchedule] = createSignal<CourseSchedule | null>(null);
  const [error, setError] = createSignal<string>("");
  const [loading, setLoading] = createSignal<boolean>(false);
  const [semesterStartDate, setSemesterStartDate] = createSignal<string>("2025-09-01"); // 默认开学日期
  const [currentWeek, setCurrentWeek] = createSignal<number>(1);

  const loadSchedule = async () => {
    setLoading(true);
    setError("");
    try {
      const pdfPath = "C:\\Code\\course-schedule\\都书锐(2025-2026-1)课表.pdf";
      const result = await invoke<CourseSchedule>("parse_pdf", { path: pdfPath });
      setSchedule(result);

      // 计算当前应该是第几周
      const today = new Date();
      const startDate = new Date(semesterStartDate());
      const firstMonday = new Date(startDate);
      const dayOfWeek = firstMonday.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      firstMonday.setDate(firstMonday.getDate() + daysToMonday);

      const diffTime = today.getTime() - firstMonday.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const calculatedWeek = Math.floor(diffDays / 7) + 1;

      // 设置为计算出的周次，但不小于1
      setCurrentWeek(Math.max(1, calculatedWeek));
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  // 计算当前周的日期范围
  const weekDates = createMemo(() => {
    const startDate = new Date(semesterStartDate());
    const week = currentWeek();

    // 计算第一周周一的日期（假设开学日期所在周为第一周）
    const firstMonday = new Date(startDate);
    const dayOfWeek = firstMonday.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    firstMonday.setDate(firstMonday.getDate() + daysToMonday);

    // 计算当前周周一的日期
    const currentMonday = new Date(firstMonday);
    currentMonday.setDate(currentMonday.getDate() + (week - 1) * 7);

    // 生成本周7天的日期
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentMonday);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }

    return dates;
  });

  // 格式化日期为 MM/DD
  const formatDate = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };

  // 获取总周数
  const totalWeeks = createMemo(() => {
    const sched = schedule();
    if (!sched) return 18;

    let maxWeek = 18;
    sched.courses.forEach(course => {
      const ranges = parseWeeks(course.weeks);
      ranges.forEach(range => {
        if (range.end > maxWeek) maxWeek = range.end;
      });
    });
    return maxWeek;
  });

  const getCourseAt = (day: number, section: number) => {
    const sched = schedule();
    if (!sched) return null;
    const week = currentWeek();

    const course = sched.courses.find(
      (c) => {
        if (c.day_of_week !== day) return false;
        if (c.start_section > section || c.end_section < section) return false;

        // 检查当前周是否在课程的周次范围内
        const weekRanges = parseWeeks(c.weeks);
        const inRange = isWeekInRange(week, weekRanges);

        return inRange;
      }
    );

    return course;
  };

  const getCourseRowSpan = (course: Course) => {
    return course.end_section - course.start_section + 1;
  };

  const shouldSkipCell = (day: number, section: number) => {
    const sched = schedule();
    if (!sched) return false;
    const week = currentWeek();

    return sched.courses.some(
      (course) => {
        if (course.day_of_week !== day) return false;
        if (course.start_section < section && course.end_section >= section) {
          // 检查当前周是否在课程的周次范围内
          const weekRanges = parseWeeks(course.weeks);
          return isWeekInRange(week, weekRanges);
        }
        return false;
      }
    );
  };

  const prevWeek = () => {
    if (currentWeek() > 1) {
      setCurrentWeek(currentWeek() - 1);
    }
  };

  const nextWeek = () => {
    if (currentWeek() < totalWeeks()) {
      setCurrentWeek(currentWeek() + 1);
    }
  };

  return (
    <div class="container mx-auto p-4">
      <Show when={!schedule()}>
        <div class="text-center space-y-4">
          <div class="form-control max-w-xs mx-auto">
            <label class="label">
              <span class="label-text">开学日期（第一周）</span>
            </label>
            <input
              type="date"
              value={semesterStartDate()}
              onInput={(e) => setSemesterStartDate(e.currentTarget.value)}
              class="input input-bordered w-full"
            />
          </div>
          <button
            onClick={loadSchedule}
            disabled={loading()}
            class="btn btn-primary rounded-full px-8 py-3"
          >
            {loading() ? "加载中..." : "加载课程表"}
          </button>
        </div>
      </Show>

      <Show when={error()}>
        <div class="alert alert-error my-4">{error()}</div>
      </Show>

      <Show when={schedule()}>
        <div class="mb-4">
          <h1 class="text-2xl font-bold">{schedule()!.semester} 课程表</h1>
          <p class="text-gray-600">
            {schedule()!.student_name} ({schedule()!.student_id})
          </p>
        </div>

        {/* 周次导航 */}
        <div class="flex items-center justify-between mb-4 bg-base-200 p-4 rounded-lg">
          <button
            onClick={prevWeek}
            disabled={currentWeek() === 1}
            class="btn btn-sm btn-circle"
          >
            ←
          </button>
          <div class="text-center flex-1">
            <div class="text-lg font-semibold">第 {currentWeek()} 周</div>
            <div class="text-sm text-gray-600">
              {formatDate(weekDates()[0])} - {formatDate(weekDates()[6])}
            </div>
            <div class="text-xs text-gray-500 mt-1">
              {/* 显示当前周有多少课程 */}
              本周共 {schedule()!.courses.filter(c => isWeekInRange(currentWeek(), parseWeeks(c.weeks))).length} 门课
            </div>
          </div>
          <button
            onClick={nextWeek}
            disabled={currentWeek() === totalWeeks()}
            class="btn btn-sm btn-circle"
          >
            →
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="table table-bordered border-collapse border border-gray-300 w-full">
            <thead>
              <tr class="bg-base-200">
                <th class="border border-gray-300 px-4 py-2 w-20">节次</th>
                <For each={DAYS}>
                  {(day, index) => (
                    <th class="border border-gray-300 px-4 py-2">
                      <div>{day}</div>
                      <div class="text-xs font-normal text-gray-600">
                        {formatDate(weekDates()[index()])}
                      </div>
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={SECTIONS}>
                {(section) => (
                  <tr>
                    <td class="border border-gray-300 px-2 py-2 text-center font-semibold">
                      {section}
                    </td>
                    <For each={[1, 2, 3, 4, 5, 6, 7]}>
                      {(day) => {
                        // 使用函数调用确保响应式
                        const getCourse = () => getCourseAt(day, section);
                        const skipCell = () => shouldSkipCell(day, section);

                        return (
                          <Show when={!skipCell()} fallback={null}>
                            <Show
                              when={getCourse()}
                              fallback={<td class="border border-gray-300 px-2 py-2 min-h-[80px]"></td>}
                            >
                              {(course) => (
                                <td
                                  class="border border-gray-300 px-2 py-2 bg-blue-50"
                                  rowspan={getCourseRowSpan(course())}
                                >
                                  <div class="text-sm">
                                    <div class="font-semibold text-blue-900">
                                      {course().name}
                                    </div>
                                    <Show when={course().teacher}>
                                      <div class="text-gray-600">{course().teacher}</div>
                                    </Show>
                                    <Show when={course().location}>
                                      <div class="text-gray-500 text-xs">
                                        {course().location}
                                      </div>
                                    </Show>
                                  </div>
                                </td>
                              )}
                            </Show>
                          </Show>
                        );
                      }}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
