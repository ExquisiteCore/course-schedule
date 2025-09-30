use app_lib::pdf_reader::read_course_schedule_pdf;
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

    let pdf_path = if args.len() > 1 {
        &args[1]
    } else {
        // 默认PDF路径
        r"C:\Code\course-schedule\都书锐(2025-2026-1)课表.pdf"
    };

    println!("正在读取PDF文件: {}", pdf_path);
    println!("{}", "=".repeat(80));

    match read_course_schedule_pdf(pdf_path) {
        Ok(schedule) => {
            println!("\n解析成功！\n");
            println!("学生姓名: {}", schedule.student_name);
            println!("学号: {}", schedule.student_id);
            println!("学期: {}", schedule.semester);
            println!("\n找到 {} 门课程:\n", schedule.courses.len());

            for (i, course) in schedule.courses.iter().enumerate() {
                println!("课程 {}:", i + 1);
                println!("  名称: {}", course.name);
                println!("  教师: {}", course.teacher);
                println!("  地点: {}", course.location);
                println!("  节次: {}", course.time_slot);
                println!("  周次: {}", course.weeks);
                println!("  星期: {}", course.day_of_week);
                println!("  开始节: {}", course.start_section);
                println!("  结束节: {}", course.end_section);
                println!();
            }

            // 输出JSON格式
            println!("\n{}", "=".repeat(80));
            println!("JSON输出:");
            println!("{}", "=".repeat(80));
            match serde_json::to_string_pretty(&schedule) {
                Ok(json) => println!("{}", json),
                Err(e) => eprintln!("JSON序列化失败: {}", e),
            }
        }
        Err(e) => {
            eprintln!("解析失败: {}", e);
            std::process::exit(1);
        }
    }
}