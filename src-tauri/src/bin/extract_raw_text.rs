use lopdf::Document;
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

    match Document::load(pdf_path) {
        Ok(doc) => {
            println!("PDF加载成功！\n");

            let pages = doc.get_pages();
            println!("总页数: {}\n", pages.len());
            println!("页面ID列表: {:?}\n", pages);

            // 尝试提取所有对象中的文本内容
            for page_num in 1..=pages.len() as u32 {
                println!("\n{}", "=".repeat(80));
                println!("尝试提取页面 {}", page_num);
                println!("{}", "=".repeat(80));

                // 尝试直接使用页面编号
                match doc.extract_text(&[page_num]) {
                    Ok(text) => {
                        println!("成功提取 (使用页面编号 {}):", page_num);
                        println!("{}", text);
                    }
                    Err(e) => {
                        eprintln!("方法1失败 (页面编号 {}): {}", page_num, e);
                    }
                }
            }

            // 尝试其他页面ID
            println!("\n\n{}", "=".repeat(80));
            println!("尝试所有可能的页面ID");
            println!("{}", "=".repeat(80));

            for page_id in &[1u32, 2, 3, 4, 5, 6, 7, 8, 9, 10] {
                match doc.extract_text(&[*page_id]) {
                    Ok(text) => {
                        if !text.trim().is_empty() {
                            println!("\n--- 页面ID {} 成功 ---", page_id);
                            println!("{}", text);
                        }
                    }
                    Err(_) => {}
                }
            }
        }
        Err(e) => {
            eprintln!("加载PDF失败: {}", e);
            std::process::exit(1);
        }
    }
}