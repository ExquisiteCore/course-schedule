import { createSignal, For, Show } from "solid-js";
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

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const SECTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function CourseSchedule() {
  const [schedule, setSchedule] = createSignal<CourseSchedule | null>(null);
  const [error, setError] = createSignal<string>("");
  const [loading, setLoading] = createSignal<boolean>(false);

  const loadSchedule = async () => {
    setLoading(true);
    setError("");
    try {
      const pdfPath = "C:\\Code\\course-schedule\\都书锐(2025-2026-1)课表.pdf";
      const result = await invoke<CourseSchedule>("parse_pdf", { path: pdfPath });
      setSchedule(result);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const getCourseAt = (day: number, section: number) => {
    const sched = schedule();
    if (!sched) return null;

    return sched.courses.find(
      (course) =>
        course.day_of_week === day &&
        course.start_section <= section &&
        course.end_section >= section
    );
  };

  const getCourseRowSpan = (course: Course) => {
    return course.end_section - course.start_section + 1;
  };

  const shouldSkipCell = (day: number, section: number) => {
    const sched = schedule();
    if (!sched) return false;

    return sched.courses.some(
      (course) =>
        course.day_of_week === day &&
        course.start_section < section &&
        course.end_section >= section
    );
  };

  return (
    <div class="container mx-auto p-4">
      <Show when={!schedule()}>
        <div class="text-center">
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
        <div class="mb-6">
          <h1 class="text-2xl font-bold">{schedule()!.semester} 课程表</h1>
          <p class="text-gray-600">
            {schedule()!.student_name} ({schedule()!.student_id})
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="table table-bordered border-collapse border border-gray-300">
            <thead>
              <tr class="bg-base-200">
                <th class="border border-gray-300 px-4 py-2">节次</th>
                <For each={DAYS}>
                  {(day) => (
                    <th class="border border-gray-300 px-4 py-2">{day}</th>
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
                        if (shouldSkipCell(day, section)) {
                          return null;
                        }

                        const course = getCourseAt(day, section);
                        if (course) {
                          return (
                            <td
                              class="border border-gray-300 px-2 py-2 bg-blue-50"
                              rowspan={getCourseRowSpan(course)}
                            >
                              <div class="text-sm">
                                <div class="font-semibold text-blue-900">
                                  {course.name}
                                </div>
                                <Show when={course.teacher}>
                                  <div class="text-gray-600">{course.teacher}</div>
                                </Show>
                                <Show when={course.location}>
                                  <div class="text-gray-500 text-xs">
                                    {course.location}
                                  </div>
                                </Show>
                                <Show when={course.weeks}>
                                  <div class="text-gray-500 text-xs">
                                    {course.weeks}
                                  </div>
                                </Show>
                              </div>
                            </td>
                          );
                        }

                        return <td class="border border-gray-300 px-2 py-2"></td>;
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
