use lopdf::Document;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Course {
    pub name: String,
    pub teacher: String,
    pub location: String,
    pub time_slot: String,  // 节次，如 "1-2节"
    pub weeks: String,      // 周次，如 "6-8周(双),9-18周"
    pub day_of_week: u8,    // 星期几 (1-7)
    pub start_section: u8,  // 开始节次
    pub end_section: u8,    // 结束节次
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CourseSchedule {
    pub student_name: String,
    pub student_id: String,
    pub semester: String,
    pub courses: Vec<Course>,
}

impl CourseSchedule {
    pub fn new() -> Self {
        CourseSchedule {
            student_name: String::new(),
            student_id: String::new(),
            semester: String::new(),
            courses: Vec::new(),
        }
    }
}

pub fn read_course_schedule_pdf(pdf_path: &str) -> Result<CourseSchedule, Box<dyn std::error::Error>> {
    let doc = Document::load(pdf_path)?;
    let mut schedule = CourseSchedule::new();

    // 提取所有页面的文本
    let mut all_text = String::new();

    // 使用页面编号直接提取
    for page_num in 1..=10 {
        if let Ok(text) = doc.extract_text(&[page_num]) {
            if !text.trim().is_empty() {
                all_text.push_str(&text);
                all_text.push('\n');
            }
        }
    }

    // 解析文本内容
    parse_schedule_text(&all_text, &mut schedule)?;

    Ok(schedule)
}

fn parse_schedule_text(text: &str, schedule: &mut CourseSchedule) -> Result<(), Box<dyn std::error::Error>> {
    let lines: Vec<&str> = text.lines().collect();

    // 提取学期信息和学生信息
    for (i, line) in lines.iter().enumerate() {
        if line.contains("学年第") && line.contains("学期") {
            schedule.semester = extract_semester(line);
        }

        // 学生信息可能在多行
        if line.contains("课表") {
            if let Some((name, _)) = extract_student_info(line) {
                schedule.student_name = name;
            }
        }

        if line.contains("学号：") || line.contains("学号:") {
            if let Some((name, id)) = extract_student_info(line) {
                if !name.is_empty() {
                    schedule.student_name = name;
                }
                schedule.student_id = id;
            }
            // 也检查前一行是否有姓名
            if i > 0 && schedule.student_name.is_empty() {
                let prev = lines[i - 1];
                if prev.contains("课表") {
                    if let Some((name, _)) = extract_student_info(prev) {
                        schedule.student_name = name;
                    }
                }
            }
        }
    }

    // PDF提取后的结构：
    // 1. 星期一...星期日（连续出现）
    // 2. 节次1，然后是该节次所有星期的课程（按星期一到星期日顺序）
    // 3. 节次2，然后是该节次所有星期的课程...

    // 查找"星期一"的位置
    let mut header_idx = None;
    for (i, line) in lines.iter().enumerate() {
        if line.trim() == "星期一" {
            header_idx = Some(i);
            break;
        }
    }

    if header_idx.is_none() {
        return Ok(());
    }

    let start_idx = header_idx.unwrap();

    // 验证星期表头顺序
    let days = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
    let mut day_count = 0;
    for (i, &day) in days.iter().enumerate() {
        if start_idx + i < lines.len() && lines[start_idx + i].trim() == day {
            day_count += 1;
        } else {
            break;
        }
    }

    if day_count == 0 {
        return Ok(());
    }

    // 从表头后开始解析课程
    let mut i = start_idx + day_count;
    let mut current_section = 0u8;
    let mut courses_in_section: Vec<(u8, String)> = Vec::new(); // (day, course_text)

    while i < lines.len() {
        let line = lines[i].trim();

        // 跳过空行和特殊行
        if line.is_empty() ||
           line.contains("其他课程") ||
           line.contains("打印时间") ||
           line.contains("上午") ||
           line.contains("下午") ||
           line.contains("晚上") ||
           line.contains("时间段") {
            i += 1;
            continue;
        }

        // 检测新的节次
        if line.len() <= 3 && line.chars().all(|c| c.is_numeric()) {
            // 先处理当前节次收集的课程
            process_section_courses(&courses_in_section, current_section, &mut schedule.courses);
            courses_in_section.clear();

            // 更新当前节次
            if let Ok(section) = line.parse::<u8>() {
                if section >= 1 && section <= 12 {
                    current_section = section;
                }
            }
            i += 1;
            continue;
        }

        // 检测课程信息（包含★或▲）
        if (line.contains("★") || line.contains("▲")) && !line.contains(": 理论") {
            // 收集完整的课程信息（包括后续行）
            let mut course_lines = vec![line];
            let mut j = i + 1;

            while j < lines.len() {
                let next = lines[j].trim();
                // 停止条件：遇到下一个课程、节次标记或空行
                if next.is_empty() {
                    j += 1;
                    continue;
                }
                if next.contains("★") || next.contains("▲") ||
                   (next.len() <= 3 && next.chars().all(|c| c.is_numeric())) ||
                   next.contains("上午") || next.contains("下午") || next.contains("晚上") {
                    break;
                }
                course_lines.push(next);
                j += 1;
            }

            let course_text = course_lines.join("\n");

            // 计算这是该节次的第几门课程（即星期几）
            let day_num = (courses_in_section.len() % 7) as u8 + 1;
            courses_in_section.push((day_num, course_text));

            i = j;
            continue;
        }

        i += 1;
    }

    // 处理最后一个节次的课程
    process_section_courses(&courses_in_section, current_section, &mut schedule.courses);

    Ok(())
}

fn process_section_courses(
    courses_data: &[(u8, String)],
    section: u8,
    courses: &mut Vec<Course>
) {
    for (day, course_text) in courses_data {
        if let Some(course) = extract_course_from_full_text(course_text, *day, section) {
            courses.push(course);
        }
    }
}

// 删除不再需要的函数
// fn parse_multi_column_courses
// fn process_buffered_courses

fn extract_course_from_full_text(text: &str, day: u8, section: u8) -> Option<Course> {
    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return None;
    }

    // 第一行是课程名称
    let course_name = lines[0]
        .replace("★", "")
        .replace("▲", "")
        .trim()
        .to_string();

    if course_name.is_empty() {
        return None;
    }

    let mut course = Course {
        name: course_name,
        teacher: String::new(),
        location: String::new(),
        time_slot: String::new(),
        weeks: String::new(),
        day_of_week: day,
        start_section: section,
        end_section: section,
    };

    // 解析详细信息（从第二行开始）
    for line in lines.iter().skip(1) {
        let info = line.trim();

        // 提取节次和周次，如 "(1-2节)6周,11周,14-18周/..."
        if let Some(time_start) = info.find('(') {
            if let Some(time_end) = info.find("节)") {
                // 需要找到 ')' 的正确位置
                let jie_end = time_end + "节)".len();
                let time_str = &info[time_start + 1..time_end + "节".len()];
                course.time_slot = time_str.to_string();

                // 解析开始和结束节次
                if let Some(dash_pos) = time_str.find('-') {
                    if let Ok(start) = time_str[..dash_pos].parse::<u8>() {
                        course.start_section = start;
                    }
                    let end_part = &time_str[dash_pos + 1..];
                    if let Some(num_end) = end_part.find('节') {
                        if let Ok(end) = end_part[..num_end].parse::<u8>() {
                            course.end_section = end;
                        }
                    }
                }

                // 提取周次信息（在 "节)" 之后，第一个 '/' 之前）
                if jie_end < info.len() {
                    let after_time = &info[jie_end..];
                    if let Some(slash_pos) = after_time.find('/') {
                        course.weeks = after_time[..slash_pos].trim().to_string();
                    } else {
                        course.weeks = after_time.trim().to_string();
                    }
                }
            }
        }

        // 提取教师
        if let Some(teacher_pos) = info.find("教师:") {
            let after_teacher = &info[teacher_pos + "教师:".len()..];
            if let Some(slash_pos) = after_teacher.find('/') {
                course.teacher = after_teacher[..slash_pos].trim().to_string();
            } else {
                course.teacher = after_teacher.trim().to_string();
            }
        }

        // 提取场地
        if let Some(location_pos) = info.find("场地:") {
            let after_location = &info[location_pos + "场地:".len()..];
            if let Some(slash_pos) = after_location.find('/') {
                course.location = after_location[..slash_pos].trim().to_string();
            } else {
                course.location = after_location.trim().to_string();
            }
        }
    }

    Some(course)
}

fn extract_semester(line: &str) -> String {
    // 提取 "2025-2026学年第1学期" 格式
    if let Some(start) = line.find(char::is_numeric) {
        let rest = &line[start..];
        if let Some(end_pos) = rest.find("学期") {
            return rest[..end_pos + "学期".len()].to_string();
        }
    }
    String::new()
}

fn extract_student_info(line: &str) -> Option<(String, String)> {
    // 从类似 "都书锐课表 学号：252712004" 的行中提取
    let mut name = String::new();
    let mut id = String::new();

    // 提取学号
    if let Some(id_pos) = line.find("学号") {
        let after_id = &line[id_pos..];
        if let Some(colon_pos) = after_id.find(|c| c == '：' || c == ':') {
            let num_start = id_pos + colon_pos + 3; // 跳过冒号
            if num_start < line.len() {
                id = line[num_start..].chars()
                    .take_while(|c| c.is_numeric())
                    .collect();
            }
        }
    }

    // 提取姓名 - 在"课表"之前
    if let Some(ke_pos) = line.find("课表") {
        // 从开头到"课表"之间查找中文字符
        let before_ke = &line[..ke_pos];
        name = before_ke.chars()
            .skip_while(|c| !is_chinese_char(*c))
            .take_while(|c| is_chinese_char(*c))
            .collect();
    }

    if !name.is_empty() || !id.is_empty() {
        Some((name, id))
    } else {
        None
    }
}

fn is_chinese_char(c: char) -> bool {
    ('\u{4e00}'..='\u{9fff}').contains(&c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_semester() {
        assert_eq!(extract_semester("2025-2026学年第1学期"), "2025-2026学年第1学期");
    }

    #[test]
    fn test_extract_student_info() {
        let result = extract_student_info("都书锐课表 学号：252712004");
        assert!(result.is_some());
        let (name, id) = result.unwrap();
        assert_eq!(name, "都书锐");
        assert_eq!(id, "252712004");
    }
}